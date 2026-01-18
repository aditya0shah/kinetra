import React, { createContext, useCallback, useMemo, useRef, useState } from 'react';
import CONFIG from '../config';
import {
  connectBleUart,
  disconnectBleDevice,
  startUartNotifications,
} from '../services/ble';

export const BluetoothContext = createContext();

export const BluetoothProvider = ({ children }) => {
  const [device, setDevice] = useState(null);
  const [txCharacteristic, setTxCharacteristic] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const stopStreamRef = useRef(null);

  const isSupported =
    typeof navigator !== 'undefined' && typeof navigator.bluetooth !== 'undefined';

  const connect = useCallback(
    async (options = {}) => {
      if (!isSupported) {
        const err = new Error('Web Bluetooth is not supported in this browser.');
        setError(err);
        throw err;
      }

      setIsConnecting(true);
      setError(null);

      try {
        const { device: dev, txCharacteristic: tx } = await connectBleUart({
          name: options.name || CONFIG.BLE.DEVICE_NAME,
        });

        dev.addEventListener('gattserverdisconnected', () => {
          setIsConnected(false);
          setDevice(null);
          setTxCharacteristic(null);
        });

        setDevice(dev);
        setTxCharacteristic(tx);
        setIsConnected(true);
        return dev;
      } catch (e) {
        setError(e);
        throw e;
      } finally {
        setIsConnecting(false);
      }
    },
    [isSupported]
  );

  const disconnect = useCallback(async () => {
    if (stopStreamRef.current) {
      await stopStreamRef.current();
      stopStreamRef.current = null;
    }
    await disconnectBleDevice(device);
    setDevice(null);
    setTxCharacteristic(null);
    setIsConnected(false);
  }, [device]);

  const startStream = useCallback(
    async ({ payloadLen, useSequence = false, onPayload }) => {
        console.log('startStream', payloadLen, useSequence, onPayload);
      if (!txCharacteristic) {
        throw new Error('Bluetooth device not connected.');
      }
      if (stopStreamRef.current) {
        await stopStreamRef.current();
        stopStreamRef.current = null;
      }
      const stop = await startUartNotifications(txCharacteristic, {
        payloadLen,
        useSequence,
        onPayload,
      });
      stopStreamRef.current = stop;
      return stop;
    },
    [txCharacteristic]
  );

  const value = useMemo(
    () => ({
      device,
      isSupported,
      isConnecting,
      isConnected,
      error,
      connect,
      disconnect,
      startStream,
    }),
    [device, isSupported, isConnecting, isConnected, error, connect, disconnect, startStream]
  );

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

