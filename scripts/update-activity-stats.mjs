import { readFile, writeFile } from "node:fs/promises";

const token = process.env.GH_STATS_TOKEN;
if (!token) {
  throw new Error("Configure GH_STATS_TOKEN in repository Actions secrets with the read:user scope.");
}

const now = new Date();
const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
const query = `
  query ProfileContributionCalendar($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: "ReuelGarces",
      from: from.toISOString(),
      to: now.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL returned HTTP ${response.status}.`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(`GitHub GraphQL returned errors: ${JSON.stringify(payload.errors)}`);
}

const total = payload.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions;
if (!Number.isInteger(total) || total < 0) {
  throw new Error("GitHub GraphQL returned an invalid contribution total.");
}

const formattedTotal = new Intl.NumberFormat("pt-BR").format(total);
const dateLabel = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
}).format(now).replaceAll(" de ", " ");

const svgPath = new URL("../assets/activity-stats.svg", import.meta.url);
let svg = await readFile(svgPath, "utf8");

function replaceRequired(pattern, replacement, label) {
  if (!pattern.test(svg)) {
    throw new Error(`Could not find the expected SVG field: ${label}`);
  }
  svg = svg.replace(pattern, replacement);
}

replaceRequired(
  /(<title id="title">Atividade no GitHub: )[^<]+( contribuições<\/title>)/,
  (_, prefix, suffix) => `${prefix}${formattedTotal}${suffix}`,
  "title",
);
replaceRequired(
  /(<desc id="desc">Total agregado de contribuições públicas e privadas nos últimos 12 meses, conforme exibido pelo perfil público do GitHub em )[^<]+(<\/desc>)/,
  (_, prefix, suffix) => `${prefix}${dateLabel}${suffix}`,
  "description",
);
replaceRequired(
  /(<text x="68" y="132"[^>]*>)[^<]*(<\/text>)/,
  (_, prefix, suffix) => `${prefix}${formattedTotal}${suffix}`,
  "total",
);
replaceRequired(
  /(públicas \+ privadas, em contagem agregada · )[^<]*/,
  (_, prefix) => `${prefix}${dateLabel}`,
  "date",
);

await writeFile(svgPath, svg, "utf8");
