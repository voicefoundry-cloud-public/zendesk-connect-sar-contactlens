import { DynamoDBClient, GetItemCommand, ScanCommand, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
const client = new DynamoDBClient({});

const getRetryKey = async (contactId) => {
    const params = {
        Key: { contactId: { S: contactId } },
        ProjectionExpression: 's3key',
        TableName: process.env.RETRIES_TABLE
    };
    const command = new GetItemCommand(params);
    const result = await client.send(command).catch((err) => {
        const message = `Error getting contact ${contactId} from DynamoDB.`;
        console.error(message, err);
        return null; // TODO: raise a cloudwatch alert
    });
    if (!result.Item) {
        console.error(`s3 key not found for contact ${contactId}`);
        return null; // TODO: raise a cloudwatch alert
    }
    return result.Item.s3key.S;
};

const getAllRetries = async () => {
    const params = {
        Select: 'SPECIFIC_ATTRIBUTES',
        ProjectionExpression: 'contactId',
        TableName: process.env.RETRIES_TABLE
    };
    const command = new ScanCommand(params);
    const results = await client.send(command).catch((err) => {
        const message = 'Error scanning DynamoDB for items.';
        console.error(message, err);
        return {}; // TODO: raise a cloudwatch alert
    });
    const retries = results.Items && results.Items.map((item) => item.contactId.S);
    return { retries, count: results.Count };
};

const addRetry = async ({ contactId, s3key }) => {
    const params = {
        Item: {
            contactId: { S: contactId },
            s3key: { S: s3key },
            expires: { N: (Math.floor(Date.now() / 1000) + process.env.EXPIRES_MINUTES * 60).toString() }
        },
        ReturnConsumedCapacity: 'TOTAL',
        TableName: process.env.RETRIES_TABLE
    };
    const command = new PutItemCommand(params);
    await client.send(command).catch((err) => {
        const message = 'Error adding new item to DynamoDB.';
        console.error(message, err);
        return false; // TODO: raise a cloudwatch alert
    });
    return true;
};

const deleteRetry = async (contactId) => {
    const params = {
        Key: { contactId: { S: contactId } },
        TableName: process.env.RETRIES_TABLE
    };
    const command = new DeleteItemCommand(params);
    await client.send(command).catch((err) => {
        const message = `Error deleting record ${contactId} from DynamoDB.`;
        console.error(message, err);
        return false; // TODO: raise a cloudwatch alert
    });
    return true;
};

export default {
    getRetryKey,
    getAllRetries,
    addRetry,
    deleteRetry
};
