// Read-only production diagnostics. Never print credentials or subscriber data.
const origin = "https://www.onedailydrop.com";
const headers = {"X-Admin-Key":process.env.ADMIN_KEY || ""};
async function read(path, authenticated = false) {
  const response = await fetch(origin + path, {headers:authenticated ? headers : {}, signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
(async () => {
  const [status,current,health,schedule] = await Promise.allSettled([
    read("/api/status?market=us"), read("/api/live/current?market=us"),
    read("/api/admin/email-health",true), read("/api/admin/live-drops",true),
  ]);
  const value = result => result.status === "fulfilled" ? result.value : {error:result.reason.message};
  const live = value(current).drop;
  const drops = value(schedule);
  console.log(JSON.stringify({
    checked_at:new Date().toISOString(),
    release:value(status).releaseId,
    email_health:value(health),
    email_delivery:drops.email_delivery,
    current:live ? {key:live.drop_key,state:live.state,start:live.start_at,end:live.end_at,
      has_product_photo:Boolean(live.image_url),has_demo_photo:Boolean(live.secondary_image_url),
      has_video:Boolean(live.video_url),has_stream:Boolean(live.stream_embed_url),
      private_host_available:live.tavus_available} : value(current).error || null,
    schedule_error:drops.error,
    drops:drops.drops?.map(drop => ({key:drop.drop_key,state:drop.state,published:drop.published,
      start:drop.start_at,end:drop.end_at,reminders:drop.reminders,
      reminder_emails_sent:drop.reminder_emails_sent,reminders_unsent:drop.reminders_unsent,
      announced:drop.announced,has_buy_link:Boolean(drop.affiliate_url),
      has_intro_script:Boolean(drop.host_script_intro),has_reveal_script:Boolean(drop.host_script_reveal)})),
  },null,2));
  if ([status,current,health,schedule].some(result => result.status === "rejected")) process.exitCode=1;
})().catch(error => { console.error(error.message);process.exitCode=1; });
