const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
const turnUrl = import.meta.env.VITE_TURN_URL?.trim() ?? "";
const turnUsername = import.meta.env.VITE_TURN_USERNAME?.trim() ?? "";
const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL?.trim() ?? "";

const iceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" }
];

if (turnUrl) {
  iceServers.push({
    urls: turnUrl,
    username: turnUsername,
    credential: turnCredential
  });
}

export const realtimeConfig = {
  supabaseUrl,
  supabasePublishableKey,
  hosted: Boolean(supabaseUrl && supabasePublishableKey),
  iceServers,
  hasTurnServer: Boolean(turnUrl)
};
