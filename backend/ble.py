import asyncio
from typing import Callable

from backend.decode import decode_frame_u16, decode_payload
from bleak import BleakClient, BleakScanner
UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
UART_RX_CHAR_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  # central -> peripheral
UART_TX_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  # peripheral -> central


class MagicFrameAssembler:
    """
    Assembles fixed-length frames from a byte stream by realigning on a 2-byte
    little-endian magic header (default 0xBEEF -> b'\\xEF\\xBE').

    If use_sequence=True, expects each BLE notification chunk to begin with a
    2-byte little-endian sequence number, which is stripped before buffering.
    """
    def __init__(self, frame_len: int, magic: int = 0xBEEF, use_sequence: bool = False) -> None:
        self.frame_len = frame_len
        self.use_sequence = use_sequence
        self._buffer = bytearray()
        self._expected_seq = 0

        self._magic = magic
        self._magic_bytes = bytes([magic & 0xFF, (magic >> 8) & 0xFF])  # little-endian

    def add_chunk(self, data: bytes) -> list[bytes]:
        if not data:
            return []

        # Optional 2-byte seq header per notification
        if self.use_sequence:
            if len(data) < 2:
                return []
            seq = data[0] | (data[1] << 8)
            if seq != self._expected_seq:
                # sequence jumped -> drop buffer to avoid mixing partial frames
                self._buffer.clear()
                self._expected_seq = seq
            self._expected_seq = (seq + 1) & 0xFFFF
            data = data[2:]
            if not data:
                return []

        self._buffer.extend(data)
        out: list[bytes] = []

        while True:
            # Find magic start
            i = self._buffer.find(self._magic_bytes)
            if i == -1:
                # Keep last byte in case magic splits across chunks (EF | BE)
                if len(self._buffer) > 1:
                    self._buffer[:] = self._buffer[-1:]
                return out

            # Drop any junk before magic
            if i > 0:
                del self._buffer[:i]

            # Need full frame
            if len(self._buffer) < self.frame_len:
                return out

            frame = bytes(self._buffer[:self.frame_len])
            del self._buffer[:self.frame_len]
            out.append(frame)



async def _find_device_by_name(device_name: str, timeout: float = 10.0):
    def _match_name(d, _):
        return d and d.name == device_name

    return await BleakScanner.find_device_by_filter(_match_name, timeout=timeout)


async def read_one_payload(
    device_name: str,
    payload_len: int,
    timeout: float = 10.0,
    use_sequence: bool = False,
) -> bytes:
    device = await _find_device_by_name(device_name, timeout=timeout)
    if device is None:
        raise RuntimeError(f"BLE device not found: {device_name}")

    assembler = MagicFrameAssembler(payload_len)
    payload_future: asyncio.Future[bytes] = asyncio.get_event_loop().create_future()

    def _handler(_, data: bytearray):
        for payload in assembler.add_chunk(bytes(data)):
            if not payload_future.done():
                payload_future.set_result(payload)

    async with BleakClient(device) as client:
        await client.start_notify(UART_TX_CHAR_UUID, _handler)
        payload = await asyncio.wait_for(payload_future, timeout=timeout)
        await client.stop_notify(UART_TX_CHAR_UUID)
        return payload


async def stream_payloads(
    device_name: str,
    payload_len: int,
    on_payload: Callable[[bytes], None],
    use_sequence: bool = False,
) -> None:
    device = await _find_device_by_name(device_name)
    if device is None:
        raise RuntimeError(f"BLE device not found: {device_name}")

    assembler = MagicFrameAssembler(payload_len)

    def _handler(_, data: bytearray):
        for payload in assembler.add_chunk(bytes(data)):
            on_payload(payload)

    async with BleakClient(device) as client:
        await client.start_notify(UART_TX_CHAR_UUID, _handler)
        try:
            while True:
                await asyncio.sleep(1.0)
        finally:
            await client.stop_notify(UART_TX_CHAR_UUID)


def _print_matrix(matrix) -> None:
    for row in matrix:
        print(", ".join(f"{v:.1f}" for v in row))


def _show_heatmap(matrix, rows: int = 12, cols: int = 8) -> None:
    import matplotlib
    import numpy as np

    if not hasattr(_show_heatmap, "_configured"):
        try:
            matplotlib.use("TkAgg")
        except Exception:
            pass
        _show_heatmap._configured = True

    import matplotlib.pyplot as plt

    vmin = -1.0
    vmax = 3700.0

    arr = np.array(matrix, dtype=float)
    if arr.ndim == 1 and arr.size == rows * cols:
        arr = arr.reshape((rows, cols))
    if arr.ndim != 2:
        return

    if not hasattr(_show_heatmap, "_im"):
        _show_heatmap._fig, _show_heatmap._ax = plt.subplots()
        _show_heatmap._im = _show_heatmap._ax.imshow(
            np.clip(arr, vmin, vmax),
            cmap="inferno_r",
            aspect="auto",
            vmin=vmin,
            vmax=vmax,
        )
        _show_heatmap._ax.set_title("Pressure Heatmap")
        _show_heatmap._fig.colorbar(_show_heatmap._im, ax=_show_heatmap._ax)
        _show_heatmap._texts = []
        plt.ion()
        plt.show(block=False)
    else:
        _show_heatmap._im.set_data(np.clip(arr, vmin, vmax))

    # Overlay raw values as text
    arr = np.clip(arr, vmin, vmax)
    for t in getattr(_show_heatmap, "_texts", []):
        t.remove()
    _show_heatmap._texts = []
    rows, cols = arr.shape
    for r in range(rows):
        for c in range(cols):
            _show_heatmap._texts.append(
                _show_heatmap._ax.text(
                    c,
                    r,
                    f"{arr[r, c]:.1f}",
                    ha="center",
                    va="center",
                    color="white",
                    fontsize=6,
                )
            )

    _show_heatmap._fig.canvas.draw_idle()
    _show_heatmap._fig.canvas.flush_events()
    plt.pause(0.001)


def _parse_args():
    import argparse

    parser = argparse.ArgumentParser(description="BLE UART test receiver")
    parser.add_argument("--name", required=True, help="BLE device name")
    parser.add_argument("--rows", type=int, default=12, help="matrix rows")
    parser.add_argument("--cols", type=int, default=8, help="matrix cols")
    parser.add_argument(
        "--min", dest="min_v", type=float, default=100.0, help="min range"
    )
    parser.add_argument(
        "--max", dest="max_v", type=float, default=100000.0, help="max range"
    )
    parser.add_argument(
        "--seq",
        action="store_true",
        help="expect 2-byte sequence header per chunk",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="read one payload then exit",
    )
    return parser.parse_args()


async def _main():
    try:
        from backend.decode import decode_payload
    except ModuleNotFoundError:
        import os
        import sys

        repo_root = os.path.dirname(os.path.dirname(__file__))
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)
        from backend.decode import decode_payload

    args = _parse_args()
    payload_len = 4 + args.rows * args.cols * 2   # 196

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=2)

    def _on_payload(payload: bytes) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, payload)

    stream_task = asyncio.create_task(
        stream_payloads(
            args.name,
            payload_len,
            on_payload=_on_payload,
            use_sequence=args.seq,
        )
    )

    try:
        while True:
            payload = await queue.get()
            frame_id, matrix = decode_frame_u16(payload, min_v=-1.0, max_v=3700.0, rows=12, cols=8)
            print("frame_id:", frame_id)


            import numpy as np

            np.set_printoptions(suppress=True, precision=2)
            print(matrix)
            _show_heatmap(matrix, rows=args.rows, cols=args.cols)
    finally:
        stream_task.cancel()


if __name__ == "__main__":
    asyncio.run(_main())

