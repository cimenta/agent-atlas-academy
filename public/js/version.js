const SEMVER = /^\d+\.\d+\.\d+$/;

export async function loadVersion(fetchFn) {
  try {
    const response = await fetchFn("/version.json");
    if (!response.ok) return "unknown";
    const data = await response.json();
    return data && typeof data.version === "string" && SEMVER.test(data.version) ? data.version : "unknown";
  } catch {
    return "unknown";
  }
}
