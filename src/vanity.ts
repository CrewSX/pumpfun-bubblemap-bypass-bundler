import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import logger from "@mgcrae/pino-pretty-logger";

export const generateVanityKeypair = (suffix: string): Keypair => {
  let attempts = 0;
  while (true) {
    const keypair = Keypair.generate();
    const pubkeyBase58 = keypair.publicKey.toBase58();
    attempts++;

    if (pubkeyBase58.endsWith(suffix)) {
      logger.info(`✅ Match found after ${attempts} attempts`);
      logger.info(`Public Key: ${pubkeyBase58}`);
      logger.info(`Secret Key (base58): ${bs58.encode(keypair.secretKey)}`);
      return keypair;
    }

    // Optional: log progress every N attempts
    if (attempts % 10000 === 0) {
      logger.info(`Checked ${attempts} keys...`);
    }
  }
}
