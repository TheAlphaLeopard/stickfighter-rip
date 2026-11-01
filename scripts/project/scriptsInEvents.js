// Stick Fighter (ARF Games) — Construct 3 event script.
// The original build contained a Poki-host sitelock that redirected any page
// not served from poki.com / localhost to https://poki.com/sitelock. That check
// is removed here so the game can boot from any static host (e.g. GitHub Pages).
// The event function is kept so the runtime's script lookup still resolves.
const scriptsInEvents = {
	async Ev_loading_Event10_Act1(runtime, localVars)
	{
		// no-op: no domain lock, no redirect
	}
};

self.C3.ScriptsInEvents = scriptsInEvents;
