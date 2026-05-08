import { secp256k1 } from '@noble/curves/secp256k1';

export interface IterationResult {
  python: string; summary: string; enough: boolean; reason: string;
}

const GONKA_NODES = [
  'https://node4.gonka.ai',
  'https://node1.gonka.ai',
  'https://node2.gonka.ai',
  'https://node3.gonka.ai',
];
const MODEL = 'moonshotai/Kimi-K2.6';

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const arr = new Uint8Array(h.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (
