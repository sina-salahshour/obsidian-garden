import { z } from "zod";
import { githubProfileLogin, type GitHubProfile } from "../lib/github-profile.ts";
import { site } from "../site.config.ts";

const profileTtl = 7 * 24 * 60 * 60 * 1000;
const retryTtl = 5 * 60 * 1000;
const login = githubProfileLogin(site.defaultAuthor.url);
const schema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().regex(/^https:\/\/(?:avatars\d*\.githubusercontent\.com|github\.com)\//),
  bio: z.string().nullable(),
  followers: z.number().int().nonnegative(),
  public_repos: z.number().int().nonnegative(),
});

let cached: { profile: GitHubProfile | null; expiresAt: number } | undefined;
let pending: Promise<GitHubProfile | null> | undefined;

async function fetchProfile(username: string): Promise<GitHubProfile> {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`GitHub profile request returned ${response.status}`);
  const data = schema.parse(await response.json());
  return {
    login: data.login,
    name: data.name,
    avatar: data.avatar_url,
    bio: data.bio,
    followers: data.followers,
    repositories: data.public_repos,
  };
}

export async function getGithubAuthor(): Promise<GitHubProfile | null> {
  if (!login) return null;
  if (cached && cached.expiresAt > Date.now()) return cached.profile;
  pending ??= fetchProfile(login)
    .then((profile) => {
      cached = { profile, expiresAt: Date.now() + profileTtl };
      return profile;
    })
    .catch(() => {
      const profile = cached?.profile ?? null;
      cached = { profile, expiresAt: Date.now() + retryTtl };
      return profile;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
