console.log('Loading function');

import api from './api.mjs';
import buildComment from './ticketComment.mjs';
import dynamoDB  from './dynamoDB.mjs';
import s3 from './s3.mjs';

// AwareSuper POC: obtain pre-signed URL
import { preSignUrl } from './preSignUrl.mjs';

export const handler = async (event, context) => {
    // console.log('Received event:', JSON.stringify(event, null, 2));

    if (event.Records) {
        // Get the key of s3 object that triggered this function by being uploaded to the bucket
        const s3key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

        // AwareSuper POC: obtain pre-signed URL
        const preSignedUrl = await preSignUrl(s3key);
        console.log(`Pre-signed URL for ${s3key}: `, preSignedUrl);

        // then get the analysis object itself
        const { contactId, analysis } = await s3.getAnalysis(s3key);
        // console.log('Analysis record: ', { contactId, analysis });

        // check for explicit exclusion of this contact
        const excludeContact = analysis.Categories.MatchedCategories.includes(process.env.EXCLUSION_KEY);
        const includeContact = analysis.Categories.MatchedCategories.includes(process.env.INCLUSION_KEY);
        if (excludeContact && !includeContact) return;

        // searching for corresponding Zendesk ticket
        const response = await api.findTickets([contactId]);
        if (response && response.length) {
            const [matchedTicket] = response;
            console.log(`Found Zendesk ticket no. ${matchedTicket.ticketId}, updating`);
            const success = await api.updateTicket(matchedTicket, buildComment(analysis));
            return success;

        } else {
            // ticket not found or something else went wrong, nedd to add contact details to retries collection
            const retry = { contactId, s3key };
            console.log('Adding retry info to DB: ', retry);
            await dynamoDB.addRetry(retry);
        }

    } else {
        // EventBridge triggered a scheduled retry
        console.log('Scheduled trigger. Checking DB:');
        const { retries, count } = await dynamoDB.getAllRetries();
        console.log('retryContactIds: ', retries);
        if (!count) return;

        // otherwise attempt to find matching tickets
        const matchedTickets = await api.findTickets(retries);
        if (!matchedTickets) return; // something went wrong

        // for each matching ticket get the Contect Lens analysis and apply it to the ticket
        // run this in parallel
        const asyncRequests = matchedTickets.map(async (ticket) => {
            const s3key = await dynamoDB.getRetryKey(ticket.contactId);
            console.log('getRetryKey: ', s3key);
            if (s3key) {
                const { analysis } = await s3.getAnalysis(s3key);
                // console.log('Analysis: ', analysis);
                const success = await api.updateTicket(ticket, buildComment(analysis));
                if (success) {
                    // we can now delete it from retries
                    await dynamoDB.deleteRetry(ticket.contactId);
                    console.log(`ticket ${ticket.ticketId} succesfully updated, record ${ticket.contactId} removed from the retries table`);
                }
            }
        });

        await Promise.all(asyncRequests);
    }

};
