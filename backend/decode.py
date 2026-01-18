from typing import List, Sequence, Union

import numpy as np


def dequantize_u16(q: int, min_v: float, max_v: float) -> float:
    return min_v + (q / 65535.0) * (max_v - min_v)


def decode_payload(
    payload: Union[bytes, bytearray, memoryview],
    min_v: float,
    max_v: float,
    rows: int = 13,
    cols: int = 9,
    as_list: bool = True,
) -> Union[List[List[float]], np.ndarray]:
    if len(payload) % 2 != 0:
        raise ValueError("payload length must be even (uint16_t packed)")

    count = len(payload) // 2
    values = [0.0] * count

    for i in range(count):
        lo = payload[2 * i]
        hi = payload[2 * i + 1]
        q = lo | (hi << 8)
        values[i] = dequantize_u16(q, min_v, max_v)

    if rows * cols == count:
        arr = np.array(values, dtype=float).reshape((rows, cols))
        return arr.tolist() if as_list else arr

    return values

def decode_frame_u16(payload: bytes, min_v: float, max_v: float, rows=13, cols=9):
    k_magic = 0xBEEF
    expected = 4 + rows * cols * 2
    if len(payload) != expected:
        raise ValueError(f"expected {expected} bytes, got {len(payload)}")

    magic = payload[0] | (payload[1] << 8)
    if magic != k_magic:
        raise ValueError(f"bad magic: {hex(magic)}")

    frame_id = payload[2] | (payload[3] << 8)

    data = payload[4:]
    arr = decode_payload(data, min_v, max_v, rows=rows, cols=cols, as_list=False)
    return frame_id, arr


def decode_payload_f32(
    payload: Union[bytes, bytearray, memoryview],
    rows: int = 12,
    cols: int = 8,
    little_endian: bool = True,
    as_list: bool = True,
) -> Union[List[List[float]], np.ndarray]:
    import struct

    if len(payload) % 4 != 0:
        raise ValueError("payload length must be multiple of 4 (float32 packed)")

    count = len(payload) // 4
    fmt = ("<" if little_endian else ">") + ("f" * count)
    values = list(struct.unpack(fmt, payload))

    if rows * cols == count:
        arr = np.array(values, dtype=float).reshape((rows, cols))
        return arr.tolist() if as_list else arr

    return values

