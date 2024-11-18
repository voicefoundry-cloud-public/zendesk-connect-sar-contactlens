import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET_NAME = process.env.CONTACT_LENS_BUCKET;
const RESTRICTED_ROLE_ARN = process.env.RESTRICTED_ROLE_ARN; // ARN of the new role with IP restrictions

export const preSignUrl = async (s3ObjectKey) => {
  try {
    // Assume the IP-restricted role
    const stsClient = new STSClient({});
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: RESTRICTED_ROLE_ARN,
      RoleSessionName: "GeneratePresignedUrlSession",
    });
    const assumedRole = await stsClient.send(assumeRoleCommand);
    const { AccessKeyId, SecretAccessKey, SessionToken } = assumedRole.Credentials;

    // Use the temporary credentials to create an S3 client
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "ap-southeast-2",
      credentials: {
        accessKeyId: AccessKeyId,
        secretAccessKey: SecretAccessKey,
        sessionToken: SessionToken,
      },
    });

    // Generate a pre-signed URL
    const getObjectCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3ObjectKey });
    const url = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 900 });
    return url;
  } catch (error) {
    console.error("Error generating pre-signed URL: ", error);
    return null;
  }
}