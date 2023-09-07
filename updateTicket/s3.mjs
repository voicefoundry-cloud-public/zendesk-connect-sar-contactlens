import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"; // ES Modules import
const client = new S3Client({});

const getAnalysis = async (key) => {
    const params = {
        Bucket: process.env.CONTACT_LENS_BUCKET,
        Key: key
    };
    const command = new GetObjectCommand(params);
    const { ContentType, Metadata, Body } = await client.send(command).catch((err) => {
        const message = `
            Error getting Contact Lens analysis for contact ${params.Key} from bucket ${params.Bucket}. 
            Make sure they exist and your bucket is in the same region as this function
            `;
        console.error(message, err);
        return {};
    });
    if (ContentType !== 'application/json') return {};
    const bodyStr = await Body?.transformToString();
    
    return {
        ContentType,
        contactId: Metadata['contact-id'],
        analysis: JSON.parse(bodyStr)
    };
};

export default {
    getAnalysis
};
