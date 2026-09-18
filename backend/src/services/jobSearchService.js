// Live job search via JSearch (RapidAPI) — a legitimate aggregator that
// returns real listings sourced from LinkedIn, Indeed, ZipRecruiter, Glassdoor
// and others, each tagged with its origin platform (`job_publisher`).
//
// Neither LinkedIn nor Indeed offer a public self-serve job search API to
// individual developers, so this is the accessible way to surface real
// LinkedIn/Indeed-sourced vacancies without violating either platform's ToS.
//
// Requires RAPIDAPI_KEY in the environment. When it's missing, or the API
// call fails for any reason, fetchLiveJobs resolves to null so callers can
// fall back to the curated mock dataset — the app keeps working either way.

const JSEARCH_HOST = process.env.RAPIDAPI_HOST || 'jsearch.p.rapidapi.com';
// RapidAPI retired the old `/search` endpoint — `/search-v2` is the current one.
const JSEARCH_URL = `https://${JSEARCH_HOST}/search-v2`;

const DEFAULT_QUERY = 'Product Manager jobs';

function buildSearchQuery(skills) {
  if (!skills || skills.length === 0) return DEFAULT_QUERY;
  return `${skills.slice(0, 3).join(' ')} jobs`;
}

function normalizeSource(publisher) {
  const p = (publisher || '').toLowerCase();
  if (p.includes('linkedin')) return 'linkedin';
  if (p.includes('indeed')) return 'indeed';
  if (p.includes('glassdoor')) return 'glassdoor';
  if (p.includes('ziprecruiter')) return 'ziprecruiter';
  return p || 'other';
}

function calculateMatchScore(skills, job) {
  if (!skills || skills.length === 0) return 60;

  const haystack = `${job.title} ${job.description || ''}`.toLowerCase();
  const hits = skills.filter((skill) => haystack.includes(skill.toLowerCase())).length;
  const ratio = hits / skills.length;

  return Math.min(100, Math.round(50 + ratio * 50));
}

async function fetchLiveJobs({ skills }) {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.log('ℹ RAPIDAPI_KEY not set — skipping live job search, using fallback jobs');
    return null;
  }

  const query = buildSearchQuery(skills);

  try {
    const url = `${JSEARCH_URL}?query=${encodeURIComponent(query)}&num_pages=1&page=1`;
    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': JSEARCH_HOST,
      },
    });

    if (!response.ok) {
      console.error(`JSearch API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const body = await response.json();
    const results = Array.isArray(body.data?.jobs) ? body.data.jobs : [];

    if (results.length === 0) return null;

    const normalized = results.map((item) => ({
      externalId: item.job_id,
      title: item.job_title || 'Untitled role',
      company: item.employer_name || 'Unknown company',
      location: [item.job_city, item.job_state, item.job_country].filter(Boolean).join(', ') || 'Remote',
      salaryMin: item.job_min_salary || null,
      salaryMax: item.job_max_salary || null,
      source: normalizeSource(item.job_publisher),
      jobUrl: item.job_apply_link || null,
      description: item.job_description || '',
    }));

    // Prefer LinkedIn/Indeed-sourced listings, but fill out with others if
    // there aren't enough of those in this page of results.
    const preferred = normalized.filter((j) => j.source === 'linkedin' || j.source === 'indeed');
    const rest = normalized.filter((j) => j.source !== 'linkedin' && j.source !== 'indeed');
    const ordered = [...preferred, ...rest];

    return ordered.slice(0, 5).map((job) => ({
      ...job,
      matchScore: calculateMatchScore(skills, job),
    }));
  } catch (error) {
    console.error('JSearch API request failed:', error.message);
    return null;
  }
}

module.exports = { fetchLiveJobs, calculateMatchScore, buildSearchQuery };
