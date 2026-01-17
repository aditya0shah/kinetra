#include <Adafruit_TinyUSB.h>
#include <bluefruit.h>

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

// ===== Storage =====
float nodeResistance[numRows][numCols];

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

void transmitBleRows() {
  if (!Bluefruit.connected() || !bleuart.notifyEnabled()) {
    return;
  }

  for (int r = 0; r < numRows; r++) {
    // Format: "RX:val,val,val..."
    bleuart.print("R"); bleuart.print(r); bleuart.print(":");
    for (int c = 0; c < numCols; c++) {
      bleuart.print(nodeResistance[r][c], 1); 
      if (c < numCols - 1) bleuart.print(",");
    }
    bleuart.println(); // Every row gets a newline trigger
    delay(2); // Give the radio time to empty the buffer
  }
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
  Bluefruit.configPrphBandwidth(BANDWIDTH_MAX); // Essential for high speed
  Bluefruit.begin();
  Bluefruit.setName("PressureGrid");
  Bluefruit.setTxPower(4);
  bleuart.begin();

  // Advertising
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.Advertising.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.start(0);

  Serial.println("BLE Pressure Grid Started...");
}

void loop() {
  static uint32_t lastLogMs = 0;
  static uint32_t loopCount = 0;

  // 1. Matrix Scan
  scanMatrix();

  // 2. BLE Transmission (Row-by-Row)
  transmitBleRows();

  delay(20); // Scan rate control

  loopCount++;
  uint32_t nowMs = millis();
  if (nowMs - lastLogMs >= 1000) {
    float hz = (loopCount * 1000.0f) / (nowMs - lastLogMs);
    Serial.print("Loop rate (Hz): ");
    Serial.println(hz, 2);
    loopCount = 0;
    lastLogMs = nowMs;
  }
}