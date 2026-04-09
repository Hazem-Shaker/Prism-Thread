import mongoose from 'mongoose';
import { rewriteMongoSrvUriWithDoh } from './atlas-doh-seedlist';
import { env } from './env';

const connectionOptions = {
  connectTimeoutMS: 30000, // 30 seconds
  socketTimeoutMS: 45000, // 45 seconds
  serverSelectionTimeoutMS: 30000,
  /** Prefer IPv4 when resolving shard hostnames (helps some Atlas / local network setups). */
  family: 4 as const,
};

function logSrvTimeoutHint(): void {
  console.error(
    "\nDNS SRV lookup timed out (mongodb+srv). IP allowlisting only applies after hosts resolve.\n" +
      "This build first tries DNS-over-HTTPS for SRV/TXT; if you still see this, HTTPS to Google/Cloudflare DNS may be blocked.\n" +
      "Fixes: use a standard mongodb://… seed list in MONGODB_URI, fix VPN/firewall/DNS, or set MONGODB_DISABLE_DOH=true only when debugging.\n"
  );
}

export async function connectDB(): Promise<void> {
  let uri = env.mongodbUri;
  if (
    uri.startsWith('mongodb+srv://') &&
    process.env.MONGODB_DISABLE_DOH !== 'true'
  ) {
    const viaDoh = await rewriteMongoSrvUriWithDoh(uri);
    if (viaDoh) {
      console.log(
        'MongoDB: seed list resolved via DNS-over-HTTPS (avoids system SRV lookup).'
      );
      uri = viaDoh;
    }
  }

  try {
    await mongoose.connect(uri, connectionOptions);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    const err = error as NodeJS.ErrnoException & { syscall?: string };
    if (err?.code === "ETIMEOUT" && err?.syscall === "querySrv") {
      logSrvTimeoutHint();
    }
    process.exit(1);
  }
}
