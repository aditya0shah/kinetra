#include <Adafruit_TinyUSB.h>
#include <bluefruit.h>
#include <string.h>

// ===== BLE =====
BLEUart bleuart;

// ===== Pin Definitions =====
const int numRows   = 12;
const int numCols   = 8;
const int selectors = 4;

const int muxOut = A0;
const int RowPins[numRows] = {2, 0, 1, 24, 25, 26, 19, 18, 17, 16, 15, 9};
const int selectorPins[selectors] = {22, 23, 5, 6};

// ===== Constants =====
const float V_SUPPLY = 3.3;
const float R_REF    = 330.0;
const int   ADC_MAX  = 4095;

// TODO: CONFIGURE LATER
const float MAX_RESISTANCE = 3700.0;
const float MIN_RESISTANCE = -1.0;

// ===== Storage =====
float nodeResistance[numRows][numCols];

const int kSampleCount = numRows * numCols;
// const int kPayloadBytes = kSampleCount * sizeof(float);
// const int kPayloadBytes = kSampleCount * 4;
// uint8_t payload[kPayloadBytes];

const uint16_t kMagic = 0xBEEF;
const int kHeaderBytes = 4; // magic (2) + frame_id (2)
const int kPayloadBytes = kHeaderBytes + kSampleCount * 2;
uint8_t payload[kPayloadBytes];

// ---- Quantize / dequantize ----
static inline uint16_t quantize_u16(float x, float minV, float maxV) {
  // Clamp
  if (x < minV) x = minV;
  if (x > maxV) x = maxV;

  // Avoid divide-by-zero
  float range = maxV - minV;
  if (range <= 0.0f) return 0;

  // Map to [0, 65535] with rounding
  float norm = (x - minV) / range;               // 0..1
  uint32_t q = (uint32_t)lroundf(norm * 65535.0f);
  if (q > 65535u) q = 65535u;
  return (uint16_t)q;
}

static inline float dequantize_u16(uint16_t q, float minV, float maxV) {
  float norm = (float)q / 65535.0f;
  return minV + norm * (maxV - minV);
}

// ---- Pack / unpack ----
static inline void pack_u16_le(uint16_t q, uint8_t* out) {
  out[0] = (uint8_t)(q & 0xFF);
  out[1] = (uint8_t)(q >> 8);
}

// void packMatrixToPayload(float minV, float maxV) {
//   int idx = 0;
//   for (int r = 0; r < numRows; r++) {
//     Serial.print("Row ");
//     Serial.print(r);
//     Serial.print(": ");

//     for (int c = 0; c < numCols; c++) {
//       if (nodeResistance[r][c] > 3700) {
//         nodeResistance[r][c] = 3700;
//       }
//       Serial.print(nodeResistance[r][c], 3);
//       Serial.print(", ");
//       uint16_t q = quantize_u16(nodeResistance[r][c], minV, maxV);
//       pack_u16_le(q, &payload[idx * 2]);
//       idx++;
//     }

//     Serial.println();
//   }
// }

void packMatrixToPayload(float minV, float maxV, uint16_t frame_id) {
  // header
  payload[0] = (uint8_t)(kMagic & 0xFF);
  payload[1] = (uint8_t)(kMagic >> 8);
  payload[2] = (uint8_t)(frame_id & 0xFF);
  payload[3] = (uint8_t)(frame_id >> 8);

  int idx = 0;
  int base = kHeaderBytes;

  for (int r = 0; r < numRows; r++) {
    // Serial.print("Row ");
    // Serial.print(r);
    // Serial.print(": ");

    for (int c = 0; c < numCols; c++) {
      float x = nodeResistance[r][c];
      if (x > maxV) x = maxV;
      if (x < minV) x = minV;

      // Debug print: only row 0
      // Serial.print(x, 3);
      // Serial.print(", ");

      uint16_t q = quantize_u16(x, minV, maxV);
      payload[base + 2 * idx + 0] = (uint8_t)(q & 0xFF);
      payload[base + 2 * idx + 1] = (uint8_t)(q >> 8);
      idx++;
    }

    // Serial.println();
  }
}

void packMatrixToPayloadFloat() {
  int idx = 0;

  for (int r = 0; r < numRows; r++) {
    // Serial.print("Row ");
    // Serial.print(r);
    // Serial.print(": ");

    for (int c = 0; c < numCols; c++) {
      float v = nodeResistance[r][c];

      // Debug print: only row 0
      // Serial.print(v, 3);
      // Serial.print(", ");

      // copy raw float bytes into payload
      memcpy(&payload[idx], &v, sizeof(float));
      idx += sizeof(float);
    }
    // Serial.println();
  }
}

// ---- BLE chunking ----
// NOTE: Sending the full payload in one BLE message requires a negotiated MTU
// large enough. If MTU is small (e.g., 23), chunk the payload.

const int kMaxChunkSize = 244; // Common max payload size when MTU is enlarged
uint8_t chunkBuf[kMaxChunkSize];

// If addSequenceHeader is true, a 2-byte little-endian sequence number
// is prepended to each chunk, reducing payload bytes per chunk by 2.
void sendChunked(const uint8_t* data, int len, int chunkSize, bool addSequenceHeader = false) {
  if (chunkSize <= 0) return;
  if (chunkSize > kMaxChunkSize) chunkSize = kMaxChunkSize;

  uint16_t seq = 0;
  int off = 0;
  while (off < len) {
    int payloadSpace = chunkSize;
    if (addSequenceHeader) {
      if (payloadSpace < 2) return;
      payloadSpace -= 2;
    }

    int n = len - off;
    if (n > payloadSpace) n = payloadSpace;

    if (addSequenceHeader) {
      chunkBuf[0] = (uint8_t)(seq & 0xFF);
      chunkBuf[1] = (uint8_t)(seq >> 8);
      memcpy(&chunkBuf[2], data + off, n);
      bleuart.write(chunkBuf, n + 2);
      seq++;
    } else {
      bleuart.write(data + off, n);
    }

    off += n;
  }
}

void setMuxChannel(uint8_t ch) {
  for (int i = 0; i < selectors; i++) {
    digitalWrite(selectorPins[i], (ch >> i) & 0x01);
  }
  delayMicroseconds(10);
}

void scanMatrix() {
  for (int r = 0; r < numRows; r++) {
    digitalWrite(RowPins[r], HIGH); // Activate 1 row
    delayMicroseconds(20);

    for (int c = 0; c < numCols; c++) {
      setMuxChannel(c);
      int adc = analogRead(muxOut);
      float v = (adc / (float)ADC_MAX) * V_SUPPLY;

      if (v > 0.05f && v < (V_SUPPLY - 0.05f)) {
        nodeResistance[r][c] = R_REF * ((V_SUPPLY / v) - 1.0f);
      } else {
        nodeResistance[r][c] = -1.0f; // Open circuit or saturated
      }
    }
    digitalWrite(RowPins[r], LOW); // Deactivate row
  }
}

void transmitBlePacked() {
  if (!Bluefruit.connected() || !bleuart.notifyEnabled()) {
    return;
  }

  static uint16_t frame_id = 0;
  packMatrixToPayload(MIN_RESISTANCE, MAX_RESISTANCE, frame_id++);

  // // Default BLE payload is often 20 bytes when MTU is 23.
  // const int chunkSize = 20;
  // sendChunked(payload, kPayloadBytes, chunkSize, false);

  // packMatrixToPayloadFloat();
  const int chunkSize = 20;
  sendChunked(payload, kPayloadBytes, chunkSize, false);
}

void setup() {
  Serial.begin(115200);

  // Configure Rows
  for (int r = 0; r < numRows; r++) {
    pinMode(RowPins[r], OUTPUT);
    digitalWrite(RowPins[r], LOW);
  }

  // Configure Mux Selects
  for (int i = 0; i < selectors; i++) {
    pinMode(selectorPins[i], OUTPUT);
    digitalWrite(selectorPins[i], LOW);
  }

  pinMode(muxOut, INPUT);
  analogReadResolution(12);

  // BLE Setup
  // Bluefruit.configPrphBandwidth(BANDWIDTH_MAX); // Essential for high speed
  // Initialize Bluefruit
  Bluefruit.begin();
  Bluefruit.setName("BLE_Test");
  Bluefruit.setTxPower(4);

  // Start BLE UART
  bleuart.begin();

  // Advertising setup
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.Advertising.addName();

  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.start(0); // 0 = advertise forever

  Serial.println("BLE advertising started");
}

void loop() {
  static uint32_t lastLogMs = 0;
  static uint32_t loopCount = 0;

  // 1. Matrix Scan
  scanMatrix();

  // 2. BLE Transmission (packed + chunked)
  transmitBlePacked();

  loopCount++;
  uint32_t nowMs = millis();
  if (nowMs - lastLogMs >= 1000) {
    float hz = (loopCount * 1000.0f) / (nowMs - lastLogMs);
    Serial.print("Loop rate (Hz): ");
    Serial.println(hz, 2);
    loopCount = 0;
    lastLogMs = nowMs;
  }

  // delay(10000);
}