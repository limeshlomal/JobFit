// Generates AI-tailored resume bullets + a cover letter for a specific
// (CV, job) pair using the Claude API. The model drafts suggestions; the
// user reviews and edits them in the UI before using them anywhere — this
// never submits anything on the user's behalf, it only writes content.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const MODEL = 'claude-opus-5';

function buildPrompt({ parsedCV, job }) {
  const bullets = (parsedCV.experience || [])
    .map((exp, i) => `${i + 1}. ${exp.jobTitle || exp.title || 'Role'} at ${exp.company || 'Unknown'}: ${exp.description || ''}`)
    .join('\n') || '(No structured experience bullets were extracted from this CV.)';

  const jobContext = job.description
    ? job.description.slice(0, 6000) // keep prompt cost bounded
    : `(No full job description available — only basic listing info: title "${job.title}" at ${job.company}, location ${job.location}.)`;

  return `You are helping a job seeker tailor their resume and write a cover letter for one specific job posting. Be honest and grounded in what's actually in their CV — never invent experience, skills, or achievements they didn't provide.

CANDIDATE'S CV
- Name: ${parsedCV.fullName || 'Unknown'}
- Skills: ${(parsedCV.skills || []).join(', ') || 'None extracted'}
- Experience bullets:
${bullets}
- Education: ${(parsedCV.education || []).map((e) => e.degree).join(', ') || 'None extracted'}

TARGET JOB
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Description: ${jobContext}

TASK
1. Rewrite each experience bullet above to better match this job's language and priorities — same facts, sharper framing. Never fabricate metrics or responsibilities not implied by the original.
2. Suggest a short (1-2 sentence) professional summary tailored to this role.
3. List up to 5 keywords from the job posting that are missing from the CV but genuinely apply to the candidate's real background (skip any that would be dishonest to claim).
4. Draft a concise (3-4 paragraph) cover letter in the candidate's voice, referencing specifics from the job posting.

Respond with ONLY a single JSON object, no markdown code fences, no commentary before or after, matching exactly this shape:
{
  "tailoredSummary": "string",
  "tailoredBullets": [{"original": "string", "tailored": "string"}],
  "keywordsToAdd": ["string"],
  "coverLetter": "string"
}`;
}

function extractJson(text) {
  // Model was instructed to return raw JSON, but strip fences defensively
  // in case it wraps the response anyway.
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

async function tailorForJob({ parsedCV, job }) {
  const prompt = buildPrompt({ parsedCV, job });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('No text content returned from tailoring model');
  }

  let parsed;
  try {
    parsed = extractJson(textBlock.text);
  } catch (parseError) {
    console.error('Failed to parse tailoring response as JSON:', textBlock.text.slice(0, 500));
    throw new Error('Tailoring model returned unparseable output');
  }

  return {
    tailoredSummary: parsed.tailoredSummary || '',
    tailoredBullets: Array.isArray(parsed.tailoredBullets) ? parsed.tailoredBullets : [],
    keywordsToAdd: Array.isArray(parsed.keywordsToAdd) ? parsed.keywordsToAdd : [],
    coverLetter: parsed.coverLetter || '',
  };
}

module.exports = { tailorForJob };
