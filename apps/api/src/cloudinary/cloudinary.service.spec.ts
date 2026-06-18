import { createHash } from 'crypto';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  beforeEach(() => {
    process.env.CLOUDINARY_URL = 'cloudinary://test-key:test-secret@test-cloud';
    service = new CloudinaryService();
  });

  it('returns the api key, cloud name, and folder from CLOUDINARY_URL', () => {
    const result = service.generateSignedUploadParams('avatars');
    expect(result.apiKey).toBe('test-key');
    expect(result.cloudName).toBe('test-cloud');
    expect(result.folder).toBe('avatars');
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('returns a signature matching Cloudinary\'s documented signing algorithm', () => {
    const result = service.generateSignedUploadParams('avatars');
    const expectedSignedString = `folder=avatars&timestamp=${result.timestamp}test-secret`;
    const expectedSignature = createHash('sha1').update(expectedSignedString).digest('hex');
    expect(result.signature).toBe(expectedSignature);
  });
});
