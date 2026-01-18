export const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const UART_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
export const UART_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

const toUint8Array = (payload) => {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (Array.isArray(payload)) return Uint8Array.from(payload);
  return new Uint8Array([]);
};

export class ChunkAssembler {
  constructor(payloadLen, useSequence = false) {
    this.payloadLen = payloadLen;
    this.useSequence = useSequence;
    this.buffer = new Uint8Array(0);
    this.expectedSeq = 0;
  }

  addChunk(data) {
    const chunk = toUint8Array(data);
    if (!chunk.length) return [];

    let offset = 0;
    if (this.useSequence) {
      if (chunk.length < 2) return [];
      const seq = chunk[0] | (chunk[1] << 8);
      if (seq !== this.expectedSeq) {
        this.buffer = new Uint8Array(0);
        this.expectedSeq = seq;
      }
      this.expectedSeq = (seq + 1) & 0xffff;
      offset = 2;
    }

    const remaining = chunk.slice(offset);
    if (!remaining.length) return [];

    const combined = new Uint8Array(this.buffer.length + remaining.length);
    combined.set(this.buffer, 0);
    combined.set(remaining, this.buffer.length);
    this.buffer = combined;

    const complete = [];
    while (this.buffer.length >= this.payloadLen) {
      complete.push(this.buffer.slice(0, this.payloadLen));
      this.buffer = this.buffer.slice(this.payloadLen);
    }

    return complete;
  }
}

export class MagicFrameAssembler {
    constructor(frameLen, magic = 0xbeef) {
      this.frameLen = frameLen;
      this.magicLo = magic & 0xff;
      this.magicHi = (magic >> 8) & 0xff;
      this.buffer = new Uint8Array(0);
    }
  
    addChunk(data) {
      const chunk = toUint8Array(data);
      if (!chunk.length) return [];
  
      // append to buffer
      const combined = new Uint8Array(this.buffer.length + chunk.length);
      combined.set(this.buffer, 0);
      combined.set(chunk, this.buffer.length);
      this.buffer = combined;
  
      const out = [];
  
      while (true) {
        // find magic 0xBEEF (little endian: EF BE)
        let start = -1;
        for (let i = 0; i + 1 < this.buffer.length; i += 1) {
          if (this.buffer[i] === this.magicLo && this.buffer[i + 1] === this.magicHi) {
            start = i;
            break;
          }
        }
  
        if (start === -1) {
          // keep last byte in case magic splits across chunks
          if (this.buffer.length > 1) {
            this.buffer = this.buffer.slice(this.buffer.length - 1);
          }
          return out;
        }
  
        // drop junk before magic
        if (start > 0) {
          this.buffer = this.buffer.slice(start);
        }
  
        // wait for full frame
        if (this.buffer.length < this.frameLen) {
          return out;
        }
  
        out.push(this.buffer.slice(0, this.frameLen));
        this.buffer = this.buffer.slice(this.frameLen);
      }
    }
  }
  

export const connectBleUart = async ({
  name,
  serviceUuid = UART_SERVICE_UUID,
} = {}) => {
  if (!navigator?.bluetooth) {
    throw new Error('Web Bluetooth is not supported in this browser.');
  }

  const filters = [];
  console.log('connectBleUart: name=', name);
  if (name) filters.push({ name });

  const device = await navigator.bluetooth.requestDevice({
    filters: filters.length ? filters : undefined,
    acceptAllDevices: filters.length ? undefined : true,
    optionalServices: [serviceUuid.toLowerCase()],
  });

  if (!device?.gatt) {
    throw new Error('No GATT server available on selected device.');
  }

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(serviceUuid);
  const txCharacteristic = await service.getCharacteristic(UART_TX_CHAR_UUID);
  const rxCharacteristic = await service.getCharacteristic(UART_RX_CHAR_UUID);

  return { device, server, txCharacteristic, rxCharacteristic };
};

export const disconnectBleDevice = async (device) => {
  if (device?.gatt?.connected) {
    device.gatt.disconnect();
  }
};

export const startUartNotifications = async (
  characteristic,
  { payloadLen, useSequence = false, onPayload }
) => {
  if (!characteristic) {
    throw new Error('Missing UART TX characteristic.');
  }
  if (typeof onPayload !== 'function') {
    throw new Error('onPayload callback is required.');
  }

  //const assembler = new ChunkAssembler(payloadLen, useSequence);
  console.log('startUartNotifications', payloadLen);
  const assembler = new MagicFrameAssembler(payloadLen);
  const handler = (event) => {
    const value = event?.target?.value;
    if (!value) return;
    const bytes = new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    );
    for (const payload of assembler.addChunk(bytes)) {
      onPayload(payload);
    }
  };

  characteristic.addEventListener('characteristicvaluechanged', handler);
  await characteristic.startNotifications();

  return async () => {
    characteristic.removeEventListener('characteristicvaluechanged', handler);
    try {
      await characteristic.stopNotifications();
    } catch (e) {
      // Ignore stop errors when device disconnects mid-stream.
    }
  };
};

const dequantizeU16 = (q, minV, maxV) => minV + (q / 65535.0) * (maxV - minV);

export const decodePayloadU16 = (payload, { minV, maxV }) => {
  const bytes = toUint8Array(payload);
  if (bytes.length % 2 !== 0) {
    throw new Error('payload length must be even (uint16 packed)');
  }
  const count = bytes.length / 2;
  const values = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const lo = bytes[i * 2];
    const hi = bytes[i * 2 + 1];
    const q = lo | (hi << 8);
    values[i] = dequantizeU16(q, minV, maxV);
  }
  return values;
};

export const decodeFrameU16 = (
  payload,
  { minV, maxV, rows = 12, cols = 8 }
) => {
  const bytes = toUint8Array(payload);
  const expected = 4 + rows * cols * 2;
  if (bytes.length !== expected) {
    throw new Error(`expected ${expected} bytes, got ${bytes.length}`);
  }
  const magic = bytes[0] | (bytes[1] << 8);
  if (magic !== 0xbeef) {
    throw new Error(`bad magic: ${magic.toString(16)}`);
  }
  const frameId = bytes[2] | (bytes[3] << 8);
  const values = decodePayloadU16(bytes.slice(4), { minV, maxV });
  const matrix = [];
  for (let r = 0; r < rows; r += 1) {
    matrix.push(values.slice(r * cols, (r + 1) * cols));
  }

  const rescaledMatrix = rescaleMatrix(matrix);
  return { frameId, matrix: rescaledMatrix }; 
};


export const rescaleMatrix = (matrix) => {
  const inMin = 700;
  const inMax = 3700;
  const outMin = 0;
  const outMax = 100;
  const inRange = inMax - inMin;
  const outRange = outMax - outMin;

  return matrix.map(row => row.map(value => {
    if (value <= 0) return -1;
    const scaled = ((value - inMin) / inRange) * outRange + outMin;
    return Math.min(outMax, Math.max(outMin, scaled));
  }));
};

