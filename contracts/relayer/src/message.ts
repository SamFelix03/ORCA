import { ethers } from "ethers";

export type DecodedMessage = {
  version: number;
  nonce: number;
  origin: number;
  sender: string;
  destination: number;
  recipient: string;
  body: string;
};

export function messageIdFromBytes(messageBytes: string): string {
  return ethers.keccak256(messageBytes);
}

export function decodeMessage(msgBytes: string): DecodedMessage {
  const d = ethers.getBytes(msgBytes);
  if (d.length < 77) {
    throw new Error(`message too short: ${d.length} bytes`);
  }
  return {
    version: d[0],
    nonce: (d[1]! << 24) | (d[2]! << 16) | (d[3]! << 8) | d[4]!,
    origin: (d[5]! << 24) | (d[6]! << 16) | (d[7]! << 8) | d[8]!,
    sender: ethers.hexlify(d.slice(9, 41)),
    destination: (d[41]! << 24) | (d[42]! << 16) | (d[43]! << 8) | d[44]!,
    recipient: ethers.hexlify(d.slice(45, 77)),
    body: ethers.hexlify(d.slice(77)),
  };
}

export function recipientAddressFromBytes32(recipient: string): string {
  return ethers.getAddress(ethers.dataSlice(recipient, 12));
}

export function normalizeRecipientBytes32(addr: string): string {
  return ethers.zeroPadValue(ethers.getAddress(addr), 32).toLowerCase();
}
