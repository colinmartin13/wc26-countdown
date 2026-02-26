// netlify/functions/matches.js
// Fetches World Cup 2026 match data from football-data.org
// Called by the PWA frontend — keeps API key server-side and safe

const API_KEY  = process.env.FOOTBALL_API_KEY;
const BASE_URL = 'https://api.football-data.org/v4';
const WC_2026  = 'WC';   // football-data.org competition code for FIFA World Cup

// Simple in-memory cache — persists for the lifetime of the function instance
// Netlify reuses warm instances, so this reduces API calls significantly
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function fetchFromAPI(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': API_KEY }
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800' // 30 min browser cache
  };

  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (cache.data && (now - cache.fetchedAt) < CACHE_TTL_MS) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ...cache.data, cached: true })
      };
    }

    // Fetch matches (all WC 2026 fixtures + results)
    const matchData = await fetchFromAPI(`/competitions/${WC_2026}/matches`);

    // Fetch standings (group stage tables)
    let standings = null;
    try {
      const standingsData = await fetchFromAPI(`/competitions/${WC_2026}/standings`);
      standings = standingsData.standings || null;
    } catch(e) {
      // Standings may not be available before group stage starts — fail gracefully
      standings = null;
    }

    const payload = {
      matches:   matchData.matches   || [],
      standings: standings,
      fetchedAt: new Date().toISOString()
    };

    // Update cache
    cache = { data: payload, fetchedAt: now };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(payload)
    };

  } catch (err) {
    console.error('matches function error:', err.message);

    // If we have stale cache, return it rather than failing completely
    if (cache.data) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ...cache.data, stale: true })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch match data', detail: err.message })
    };
  }
};
