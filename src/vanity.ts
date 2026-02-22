import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export const generateVanityKeypair = (suffix: string): Keypair => {
  let attempts = 0;
  while (true) {
    const keypair = Keypair.generate();
    const pubkeyBase58 = keypair.publicKey.toBase58();
    attempts++;

    if (pubkeyBase58.endsWith(suffix)) {
      console.log(`✅ Match found after ${attempts} attempts`);
      console.log(`Public Key: ${pubkeyBase58}`);
      console.log(`Secret Key (base58): ${bs58.encode(keypair.secretKey)}`);
      return keypair;
    }

    // Optional: log progress every N attempts
    if (attempts % 10000 === 0) {
      console.log(`Checked ${attempts} keys...`);
    }
  }
}
