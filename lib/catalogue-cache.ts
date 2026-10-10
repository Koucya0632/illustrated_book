// How long a catalogue read is served from the data cache before it is fetched
// again. The catalogue is one ~1.7 MB result, and at the old 60s every minute
// with traffic pulled it across the pooler again. Database reads through the
// pooler were 99% of the Supabase egress that got the project restricted on
// 2026-10-10, and the catalogue-wide ones are the largest of them. An admin
// edit busts the `words` tag at once (`bustCaches` in words-db.ts), so this
// window is only how long a write made outside a request (a CLI import) can
// go unseen.
export const CATALOGUE_REVALIDATE_SECONDS = 3600;
