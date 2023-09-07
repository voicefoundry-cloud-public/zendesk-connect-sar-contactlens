import header from './commentHeader.mjs';

const wrapInBox = (contents) => {
    return `<div class="contact-lens-box">${contents}</div>`;
};

const getTitle = (title) => {
    return `<div class="contact-lens-section-title">${title}</div>`;
};

const roundPercentRate = (share, total) => Math.round(share / total * 100);

const buildCategories = (categories) => {
    return categories.reduce((markup, category) => markup + `<div class="lens-cat">${category}</div>`, '');
};

const buildOverallSentiment = (analysis, side) => {
    const sideKey = side.toUpperCase();
    const participantId = analysis.Participants.find((p) => p.ParticipantRole === sideKey).ParticipantId;
    const overallScore = analysis.ConversationCharacteristics.Sentiment.OverallSentiment[sideKey];
    let overallLabel = 'Neutral';
    if (overallScore > 1.5) overallLabel = 'Positive';
    if (overallScore < -1.5) overallLabel = 'Negative';
    const participantTurns = analysis.Transcript.filter((turn) => turn.ParticipantId === participantId);
    const calcSentimentRate = (label) => roundPercentRate(participantTurns.filter((turn) => turn.Sentiment === label).length, participantTurns.length);
    const positiveRate = calcSentimentRate('POSITIVE');
    const negativeRate = calcSentimentRate('NEGATIVE');
    const neutralRate = calcSentimentRate('NEUTRAL');
    const mixedRate = 100 - (positiveRate + negativeRate + neutralRate);
    return `<p><strong>${side}</strong> overall sentiment: ${overallLabel}</p>` +
        `<p>Positive: ${positiveRate}%</p><p>Negative: ${negativeRate}%</p><p>Neutral: ${neutralRate}%</p><p>Mixed: ${mixedRate}%</p>`;
};

const getCTRLink = (analysis) => {
    const contactId = analysis.CustomerMetadata.ContactId;
    let url = process.env.CONNECT_INSTANCE_URL;
    if (!url)
        return 'related contact trace record';

    if (url.endsWith('.awsapps.com'))
        url += '/connect';
    url += `/contact-trace-records/details/${contactId}`;
    if (process.env.TIME_ZONE)
        url += `?tz=${process.env.TIME_ZONE}`;
    return `<a href="${url}" rel="noreferer" target="_blank">contact trace record</a>`;
};

const buildConversationCharacteristics = (analysis, side) => {
    const forAgent = side === 'Agent';
    const { ConversationCharacteristics } = analysis;
    const nonTalkTime = ConversationCharacteristics.NonTalkTime.TotalTimeMillis;
    const { AGENT: agentTalk, CUSTOMER: customerTalk } = ConversationCharacteristics.TalkTime.DetailsByParticipant;
    const agentTalkTime = agentTalk.TotalTimeMillis;
    const customerTalkTime = customerTalk.TotalTimeMillis;
    const totalTime = nonTalkTime + agentTalkTime + customerTalkTime;
    const talkRate = roundPercentRate(forAgent ? agentTalkTime : customerTalkTime, totalTime);
    const { AGENT: agentInterruptions, CUSTOMER: customerInterruptions } = ConversationCharacteristics.Interruptions.InterruptionsByInterrupter;
    const interruptions = forAgent ? (agentInterruptions?.length || 0) : (customerInterruptions?.length || 0);
    const { AGENT: agentTalkSpeed, CUSTOMER: customerTalkSpeed } = ConversationCharacteristics.TalkSpeed.DetailsByParticipant;
    const talkSpeed = forAgent ? (agentTalkSpeed?.AverageWordsPerMinute || 'n/a') : (customerTalkSpeed?.AverageWordsPerMinute || 'n/a');
    let htmlSection = `
        <p>${side} interruptions: ${interruptions}</p>
        <p>${side} talk speed: ${talkSpeed} words/min</p>
        <p>${side} talk time: ${talkRate}%</p>`;
    if (forAgent) {
        const customerTalkRate = roundPercentRate(customerTalkTime, totalTime);
        htmlSection += `<p>Non-talk time: ${100 - (talkRate + customerTalkRate)}%</p>`;
    }
    return htmlSection;
};

const buildTranscript = (analysis, plaintext = false) => {
    const agentId = analysis.Participants.find((p) => p.ParticipantRole === 'AGENT').ParticipantId;
    const timeMark = (time) => {
        const formatPart = (num) => Math.floor(num).toString().padStart(2, '0');
        return formatPart(time / 60) + ':' + formatPart(time % 60);
    };
    const smileyIcons = {
        positive: plaintext ? '😀' : '&#x1F600',
        neutral: plaintext ? '😐' : '&#x1F610',
        mixed: plaintext ? '😕' : '&#x1F615',
        negative: plaintext ? '😠' : '&#x1F620'
    };
    return analysis.Transcript.reduce((markup, turn) => {
        const role = turn.ParticipantId === agentId ? 'agent' : 'customer';
        const sentiment = turn.Sentiment.toLowerCase();
        const smiley = plaintext ? smileyIcons[sentiment] : `<div class="sentiment-icon sentiment-icon-${role}" style="background-color: #fafafa;">${smileyIcons[sentiment]}</div>`;
        const timeOffset = timeMark(turn.BeginOffsetMillis / 1000);
        const content = turn.Content;
        return markup + (plaintext 
            ? `\n[${timeOffset}] ${smiley} ${role}: ${content}`
            : `<div class="${role}-time">${role.toUpperCase()} &#183; ${timeOffset}</div>` +
            `<div class="${role}-turn">` +
            (role === 'agent'
                ? `${smiley}<div class="turn-bubble">${content}</div>`
                : `<div class="turn-bubble">${content}</div>${smiley}`) +
            `</div>`);
    }, '');
};

const buildComment = (analysis) => {
    // time of call
    const contactIdNote = `<div><strong>Contact ID: </strong>${analysis.CustomerMetadata.ContactId}</div>`;
    // sectionCategories
    const categories = analysis.Categories.MatchedCategories;
    const sectionCategories = categories.length
        ? getTitle('Categories') + `<div>${buildCategories(categories)}</div>`
        : '';
    // overall sentiment analysis
    const sectionSentiment = getTitle('Overall sentiment analysis') + `
        <div style="float:left; width: 50%">${buildOverallSentiment(analysis, 'Agent')}</div>
        <div>${buildOverallSentiment(analysis, 'Customer')}</div>
        <div style="margin-top: 8px; font-style: italic;">For a more detailed sentiment analysis,
            view the ${getCTRLink(analysis)}</div>`;
    // talk speed, interruptions and times
    const sectionConversation = getTitle('Conversation characteristics') + `
        <div style="float:left; width: 50%;">${buildConversationCharacteristics(analysis, 'Agent')}</div>
        <div>${buildConversationCharacteristics(analysis, 'Customer')}</div><div style="margin-bottom: 10px;">&nbsp;</div>`;
    // transcript
    const sectionTranscript = `<div class="contact-lens-section-title" style="margin-top: 6px;">Transcript</div>` + buildTranscript(analysis);
    const plainTextTranscript = buildTranscript(analysis, true);

    return { 
        htmlStats: header() + wrapInBox(contactIdNote + sectionCategories + sectionSentiment + sectionConversation),
        htmlTranscript: wrapInBox(sectionTranscript),
        plainTextTranscript,
    };
};

export default buildComment;
