// AI Call Tools — function calling handlers for AI calls.
// Each tool maps to an action the AI can perform mid-call.
const mongoose = require('mongoose');

// Tool definitions (OpenAI function calling format)
const TOOL_DEFINITIONS = [{
    type: 'function',
    name: 'schedule_followup',
    description: 'Schedule a follow-up WhatsApp message to send after the call ends.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Follow-up message to send (in Hindi/Hinglish)' },
        delay_minutes: { type: 'number', description: 'Minutes after call to send (default 5)' },
      },
      required: ['message'],
    },
  },
{
    type: 'function',
    name: 'collect_feedback',
    description: 'Save customer feedback/survey response. Use when customer gives a rating or feedback.',
    parameters: {
      type: 'object',
      properties: {
        rating: { type: 'number', description: 'Rating 1-5 if given' },
        feedback: { type: 'string', description: 'Customer feedback text' },
        category: { type: 'string', description: 'Category: product, service, delivery, general' },
      },
      required: ['feedback'],
    },
  }];

// Groq-compatible tool definitions (same structure, slightly different wrapper)
const GROQ_TOOLS = TOOL_DEFINITIONS.map(t => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

// Execute a tool call. Returns result string.
async function executeTool(toolName, args, context) {
  const { workspaceId, phone, accessToken, phoneNumberId } = context;

  // Ensure contact exists or create
  const Contact = mongoose.model('Contact');
  const digits = (phone || '').replace(/[^0-9]/g, '');
  let contact = await Contact.findOne({
    workspace: workspaceId,
    phone: { $in: [digits, digits.replace(/^91/, '')] },
  });
  if (!contact) {
    contact = await Contact.create({ workspace: workspaceId, phone: digits, name: 'AI Call - ' + digits });
  }

  switch (toolName) {
    case 'schedule_followup': return await handleScheduleFollowup(args, contact, accessToken, phoneNumberId);
    case 'collect_feedback': return await handleCollectFeedback(args, workspaceId, contact);
    default: return JSON.stringify({ error: 'Unknown tool: ' + toolName });
  }
}







async function handleScheduleFollowup(args, contact, accessToken, phoneNumberId) {
  const delay = (args.delay_minutes || 5) * 60 * 1000;
  const msg = args.message;
  // Schedule message after delay
  setTimeout(async () => {
    try {
      const WhatsAppService = require('./whatsappService');
      const wa = new WhatsAppService(accessToken, phoneNumberId);
      await wa.sendTextMessage(contact.phone, msg);
      console.log('[AI Call][Tool] Follow-up sent to', contact.phone);
    } catch (e) {
      console.error('[AI Call][Tool] Follow-up send failed:', e.message);
    }
  }, delay);
  console.log('[AI Call][Tool] Follow-up scheduled:', delay / 60000, 'min');
  return JSON.stringify({ success: true, message: 'Follow-up message scheduled for ' + (args.delay_minutes || 5) + ' minutes after call' });
}

async function handleCollectFeedback(args, workspaceId, contact) {
  const ContactNote = mongoose.model('ContactNote');
  const feedbackText = (args.rating ? 'Rating: ' + args.rating + '/5\n' : '') +
    (args.category ? 'Category: ' + args.category + '\n' : '') +
    'Feedback: ' + args.feedback;
  await ContactNote.create({
    workspace: workspaceId,
    contact: contact._id,
    text: feedbackText,
  });
  // Also update contact custom fields
  const Contact = mongoose.model('Contact');
  await Contact.updateOne({ _id: contact._id }, {
    $set: {
      'customFields.lastFeedback': args.feedback,
      'customFields.lastRating': args.rating || null,
      'customFields.feedbackDate': new Date().toISOString(),
    }
  });
  console.log('[AI Call][Tool] Feedback saved for', contact.phone);
  return JSON.stringify({ success: true, message: 'Feedback recorded - thank you' });
}



module.exports = { TOOL_DEFINITIONS, GROQ_TOOLS, executeTool };
