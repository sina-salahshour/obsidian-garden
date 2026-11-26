export type GitHubProfile = {
  login: string;
  name: string | null;
  avatar: string;
  bio: string | null;
  followers: number;
  repositories: number;
};

export function githubProfileLogin(url: string | null): string | undefined {
  return url?.match(/^https:\/\/github\.com\/([a-z\d][a-z\d-]{0,38})\/?$/i)?.[1];
}
