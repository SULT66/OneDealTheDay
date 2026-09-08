const dns = require("dns").promises;

/*
 * Why no email is arriving, answered by the site rather than by somebody with
 * a terminal.
 *
 * Mail delivery has been "not configured" for weeks and the only signal
 * anywhere was a single boolean on the admin screen. It said the key was
 * missing, which was true and useless: the key is the last of four things, and
 * setting it while the three before it are undone produces mail that is
 * accepted by SendGrid and dropped by Gmail.
 *
 * The four, in the order they have to happen:
 *
 *   1. SendGrid domain authentication — three CNAMEs at the registrar, which
 *      is what lets a message be signed as onedailydrop.com rather than as
 *      sendgrid.net.
 *   2. DMARC, so the mailbox providers have a policy to read.
 *   3. A Mail-Send API key in the environment.
 *   4. A from address on the authenticated domain.
 *
 * The DNS half is checked live, because a record somebody believes they added
 * and a record that resolves are different things, and the gap between them is
 * where a week goes.
 *
 * Deliberately not checked: the root SPF record. SendGrid's CNAME
 * authentication puts the return path on a subdomain with its own SPF, so the
 * root record stays as Microsoft wrote it. Editing it is the one action here
 * that could break mail the domain already receives.
 */

const SENDGRID_DKIM_HOSTS = ["s1._domainkey", "s2._domainkey"];

/*
 * Asked over DNS-over-HTTPS rather than through the host resolver.
 *
 * The first version used dns.resolveTxt, which on a machine whose resolver
 * refuses outbound queries returns an error indistinguishable from "no such
 * record" — so the check reported the DMARC record missing when it was plainly
 * there, and would have sent somebody back to the registrar to add it twice.
 * A diagnostic that invents work is worse than no diagnostic.
 *
 * The site already depends on outbound HTTPS for everything it does, and this
 * way the answer is the same from any machine.
 */
async function resolves(host, type, fetchImpl = global.fetch) {
  try {
    const response = await fetchImpl(
      `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return { checked: false, answers: [], why: `resolver answered ${response.status}` };
    const body = await response.json();
    const answers = (body.Answer || []).map((entry) => String(entry.data || "").replace(/^"|"$/g, ""));
    return { checked: true, answers, ok: answers.length > 0 };
  } catch (error) {
    /* Could not ask, which is not the same as asked and told no. */
    return { checked: false, answers: [], why: error.message };
  }
}

/* done is true, false, or null for "could not check" — three states, because
   two would make an unreachable resolver look like unfinished work. */
const state = (result) => (result.checked ? Boolean(result.ok) : null);

async function emailHealth(domain = "onedailydrop.com", env = process.env, fetchImpl = global.fetch) {
  const from = String(env.EMAIL_FROM || env.PASSWORD_RESET_FROM_EMAIL || "").trim();
  const fromDomain = from.includes("@") ? from.split("@").pop().toLowerCase() : "";

  const [dkim1, dkim2, dmarc] = await Promise.all([
    resolves(`${SENDGRID_DKIM_HOSTS[0]}.${domain}`, "CNAME", fetchImpl),
    resolves(`${SENDGRID_DKIM_HOSTS[1]}.${domain}`, "CNAME", fetchImpl),
    resolves(`_dmarc.${domain}`, "TXT", fetchImpl),
  ]);

  const steps = [
    {
      step: "Domain authentication (CNAME records)",
      done: dkim1.checked && dkim2.checked ? Boolean(dkim1.ok && dkim2.ok) : null,
      detail: !dkim1.checked || !dkim2.checked
        ? `could not check DNS: ${dkim1.why || dkim2.why}`
        : dkim1.ok && dkim2.ok
          ? "s1 and s2 both resolve"
          : "add the CNAME records SendGrid shows under Sender Authentication at the registrar",
      /* Named so it is obvious which of the several DNS jobs this is. */
      records: SENDGRID_DKIM_HOSTS.map(host => `${host}.${domain}`),
    },
    {
      step: "DMARC policy",
      done: state(dmarc),
      detail: !dmarc.checked
        ? `could not check DNS: ${dmarc.why}`
        : dmarc.ok
          ? dmarc.answers.find(value => /^v=DMARC1/i.test(value)) || dmarc.answers[0]
          : `add a TXT record at _dmarc.${domain}`,
    },
    {
      step: "Mail-Send API key",
      done: Boolean(String(env.SENDGRID_API_KEY || "").trim()),
      detail: String(env.SENDGRID_API_KEY || "").trim()
        ? "SENDGRID_API_KEY is set"
        : "set SENDGRID_API_KEY in the app settings",
    },
    {
      step: "From address on the authenticated domain",
      done: Boolean(fromDomain) && (fromDomain === domain || fromDomain.endsWith(`.${domain}`)),
      detail: from
        ? `EMAIL_FROM is ${from}`
        : `set EMAIL_FROM to an address at ${domain}`,
    },
  ];

  return {
    domain,
    /* Every step known to be done — a step we could not check is not a step
       that passed. And ready is not the same as delivered: only a real send
       proves that, which is what the test endpoint is for. */
    ready: steps.every(step => step.done === true),
    steps,
  };
}

module.exports = { emailHealth };
