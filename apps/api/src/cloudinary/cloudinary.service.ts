import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface SignedUploadParams {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
}

@Injectable()
export class CloudinaryService {
  generateSignedUploadParams(folder: string): SignedUploadParams {
    const { username: apiKey, password: apiSecret, hostname: cloudName } = new URL(
      process.env.CLOUDINARY_URL as string,
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ folder, timestamp }, apiSecret);
    return { timestamp, signature, apiKey, cloudName, folder };
  }

  private sign(params: Record<string, string | number>, apiSecret: string): string {
    const sorted = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return createHash('sha1').update(sorted + apiSecret).digest('hex');
  }
}
