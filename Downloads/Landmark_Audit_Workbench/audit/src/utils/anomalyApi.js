// Use 127.0.0.1 so the browser does not hit ::1 while uvicorn often binds IPv4 only.
const DEFAULT_API_URL =
  process.env.REACT_APP_ANOMALY_API_URL || 'http://127.0.0.1:8000/v1/anomaly/score';

export async function scoreAnomalies({ transactions, findings, periodicProfiles, config }) {
  const res = await fetch(DEFAULT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactions,
      findings,
      periodic_profiles: periodicProfiles || [],
      config: {
        threshold: config?.anomalyThreshold ?? 0.65,
        vote_count_threshold: config?.anomalyVoteCount ?? 3,
        contamination: config?.anomalyContamination ?? 0.08,
        include_rule_flags_in_ml: config?.anomalyIncludeRuleFlagsInMl !== false,
        model_timeout_seconds:
          config?.anomalyModelTimeoutSeconds != null && config.anomalyModelTimeoutSeconds > 0
            ? config.anomalyModelTimeoutSeconds
            : null,
        active_anomaly_models:
          Array.isArray(config?.anomalyActiveModels) && config.anomalyActiveModels.length > 0
            ? config.anomalyActiveModels
            : null,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anomaly API error (${res.status}): ${text}`);
  }
  return res.json();
}
