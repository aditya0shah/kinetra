"""
BLE Utilities for device discovery and connection.

Extracted from backend/ble.py for reuse across the project.
These utilities handle device discovery, connection, and streaming.
"""

import asyncio
from typing import Callable, Optional
from bleak import BleakClient, BleakScanner

# BLE UART Service UUIDs (Nordic UART Service)
UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
UART_RX_CHAR_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  # central -> peripheral
UART_TX_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  # peripheral -> central


class ChunkAssembler:
    """Assembles BLE chunks into complete payloads.
    
    Handles fragmented BLE packets and sequence numbers if needed.
    """
    
    def __init__(self, payload_len: int, use_sequence: bool = False) -> None:
        """Initialize chunk assembler.
        
        Args:
            payload_len: Expected length of complete payload
            use_sequence: If True, expect 2-byte sequence header per chunk
        """
        self.payload_len = payload_len
        self.use_sequence = use_sequence
        self._buffer = bytearray()
        self._expected_seq = 0

    def add_chunk(self, data: bytes) -> list[bytes]:
        """Add a chunk of data and return any complete payloads.
        
        Args:
            data: Raw bytes from BLE notification
            
        Returns:
            List of complete payloads (may be empty)
        """
        if self.use_sequence:
            if len(data) < 2:
                return []
            seq = data[0] | (data[1] << 8)
            # If sequence jumps, reset to avoid mixing payloads.
            if seq != self._expected_seq:
                self._buffer.clear()
                self._expected_seq = seq
            self._expected_seq = (seq + 1) & 0xFFFF
            data = data[2:]

        if not data:
            return []

        self._buffer.extend(data)
        complete = []
        while len(self._buffer) >= self.payload_len:
            complete.append(bytes(self._buffer[: self.payload_len]))
            del self._buffer[: self.payload_len]
        return complete


async def find_device_by_name(
    device_name: str, 
    timeout: float = 10.0,
    service_uuid: Optional[str] = None
) -> Optional[BleakClient]:
    """Find BLE device by name with fallback strategies.
    
    Tries multiple discovery strategies:
    1. Search by exact name match
    2. Search by service UUID (if provided)
    3. Scan all devices and look for partial name match
    
    Args:
        device_name: Name of the device to find
        timeout: Timeout for each discovery attempt
        service_uuid: Optional service UUID to search for
        
    Returns:
        BleakClient device object, or None if not found
    """
    # Strategy 1: Try exact name match
    device = await BleakScanner.find_device_by_name(device_name, timeout=timeout)
    
    if device:
        return device
    
    # Strategy 2: Try service UUID search (if provided)
    if service_uuid:
        devices = await BleakScanner.discover(timeout=timeout, service_uuids=[service_uuid])
        if devices:
            print(f"Found {len(devices)} device(s) with service {service_uuid}:")
            for d in devices:
                print(f"  - {d.name or 'Unknown'} ({d.address})")
            return devices[0]  # Use first match
    
    # Strategy 3: Scan all devices and look for partial match
    print(f"\nScanning all nearby BLE devices...")
    all_devices = await BleakScanner.discover(timeout=timeout)
    if all_devices:
        print(f"\nFound {len(all_devices)} BLE device(s):")
        for d in all_devices:
            name = d.name or "Unknown"
            print(f"  - {name} ({d.address})")
            if device_name.lower() in name.lower():
                print(f"    ^ This might be the device!")
                return d
    
    return None


async def connect_to_device(
    device_name: str,
    timeout: float = 10.0,
    service_uuid: Optional[str] = None,
    print_connection_info: bool = True
) -> Optional[BleakClient]:
    """Find and connect to a BLE device by name.
    
    Args:
        device_name: Name of the device to connect to
        timeout: Timeout for discovery and connection
        service_uuid: Optional service UUID to search for
        print_connection_info: Whether to print connection status
        
    Returns:
        Connected BleakClient, or None if connection failed
    """
    if print_connection_info:
        print(f"Scanning for BLE device: {device_name}...")
        print("(This may take up to 10 seconds...)")
    
    device = await find_device_by_name(device_name, timeout, service_uuid)
    
    if device is None:
        if print_connection_info:
            print(f"\n❌ Device '{device_name}' not found.")
            print("\nTroubleshooting:")
            print("  1. Make sure the Arduino is powered on")
            print("  2. Check that the device is not connected to another device (phone, etc.)")
            print("  3. Try resetting the Arduino")
            print(f"  4. Verify the device name matches exactly: '{device_name}'")
        return None
    
    if print_connection_info:
        print(f"\n✓ Found device: {device.name or device.address}")
        print(f"  Address: {device.address}")
        print("Connecting...")
    
    try:
        client = BleakClient(device)
        await client.connect()
        if print_connection_info:
            print(f"✓ Connected to {device.name or device.address}!")
        return client
    except Exception as e:
        if print_connection_info:
            print(f"❌ Connection error: {e}")
            print("Make sure the device is not connected to another device.")
        return None


async def stream_notifications(
    device_name: str,
    char_uuid: str,
    on_data: Callable[[bytearray], None],
    timeout: float = 10.0,
    service_uuid: Optional[str] = None,
) -> None:
    """Stream BLE notifications from a device.
    
    Args:
        device_name: Name of the device
        char_uuid: Characteristic UUID to subscribe to
        on_data: Callback function called with each data chunk (bytearray)
        timeout: Timeout for discovery and connection
        service_uuid: Optional service UUID to search for
    """
    device = await find_device_by_name(device_name, timeout, service_uuid)
    if device is None:
        raise RuntimeError(f"BLE device not found: {device_name}")

    def _handler(sender, data: bytearray):
        on_data(data)

    async with BleakClient(device) as client:
        await client.start_notify(char_uuid, _handler)
        try:
            while True:
                await asyncio.sleep(1.0)
        finally:
            await client.stop_notify(char_uuid)


async def stream_payloads(
    device_name: str,
    payload_len: int,
    on_payload: Callable[[bytes], None],
    char_uuid: str = UART_TX_CHAR_UUID,
    use_sequence: bool = False,
    timeout: float = 10.0,
    service_uuid: Optional[str] = None,
) -> None:
    """Stream complete payloads from BLE device.
    
    Assembles chunks into complete payloads before calling callback.
    Useful for binary payloads that may be fragmented across multiple BLE packets.
    
    Args:
        device_name: Name of the device
        payload_len: Expected length of complete payload
        on_payload: Callback function called with each complete payload (bytes)
        char_uuid: Characteristic UUID to subscribe to
        use_sequence: If True, expect 2-byte sequence header per chunk
        timeout: Timeout for discovery and connection
        service_uuid: Optional service UUID to search for
    """
    device = await find_device_by_name(device_name, timeout, service_uuid)
    if device is None:
        raise RuntimeError(f"BLE device not found: {device_name}")

    assembler = ChunkAssembler(payload_len, use_sequence=use_sequence)

    def _handler(sender, data: bytearray):
        for payload in assembler.add_chunk(bytes(data)):
            on_payload(payload)

    async with BleakClient(device) as client:
        await client.start_notify(char_uuid, _handler)
        try:
            while True:
                await asyncio.sleep(1.0)
        finally:
            await client.stop_notify(char_uuid)


async def stream_text_notifications(
    device_name: str,
    char_uuid: str,
    on_line: Callable[[str], None],
    timeout: float = 10.0,
    service_uuid: Optional[str] = None,
    encoding: str = 'utf-8',
    errors: str = 'ignore'
) -> None:
    """Stream text-based BLE notifications line by line.
    
    Assembles fragmented text data into complete lines.
    Useful for UART-style text communication.
    
    Args:
        device_name: Name of the device
        char_uuid: Characteristic UUID to subscribe to
        on_line: Callback function called with each complete line (str)
        timeout: Timeout for discovery and connection
        service_uuid: Optional service UUID to search for
        encoding: Text encoding (default: 'utf-8')
        errors: Error handling for decoding (default: 'ignore')
    """
    device = await find_device_by_name(device_name, timeout, service_uuid)
    if device is None:
        raise RuntimeError(f"BLE device not found: {device_name}")

    buffer = ""

    def _handler(sender, data: bytearray):
        nonlocal buffer
        try:
            buffer += data.decode(encoding, errors=errors)
            if '\n' in buffer:
                lines = buffer.split('\n')
                # Process all complete lines
                for line in lines[:-1]:
                    on_line(line.strip())
                # Keep the remainder
                buffer = lines[-1]
        except Exception as e:
            print(f"Data decoding error: {e}")

    async with BleakClient(device) as client:
        await client.start_notify(char_uuid, _handler)
        try:
            while True:
                await asyncio.sleep(1.0)
        finally:
            await client.stop_notify(char_uuid)
