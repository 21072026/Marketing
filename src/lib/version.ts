import pkg from "../../package.json";

// package.json is a static JSON import — Next.js inlines its contents into the
// compiled server bundle at build time, so this needs no runtime file access.
// GIT_SHA is baked into the Docker image at build time (see Dockerfile and
// .github/workflows/build-image.yml); 'dev' locally.
export const APP_VERSION: string = pkg.version;
export const GIT_SHA: string = (process.env.GIT_SHA || "dev").slice(0, 7);

/// Which deployment this build is: 'production' | 'preview' | 'development'.
/// Inlined at build time because it is a NEXT_PUBLIC_* value.
export const APP_ENV: string = process.env.NEXT_PUBLIC_APP_ENV || "development";
