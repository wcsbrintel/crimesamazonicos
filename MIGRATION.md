# Amazon Crimes migration provenance

- Source: https://github.com/acarvalho-wcs/WCS
- Source branch: `amazon-crimes-pages`
- Source commit: `88f5c4c947952c4857556f4a45fed57140270f18`
- Destination: https://github.com/wcsbrintel/crimesamazonicos
- Copied application files: 77
- Validated canonical event records: 176
- Production publication: `amazon-crimes/public`, via GitHub Actions on `main`
- Intended Pages URL: https://wcsbrintel.github.io/crimesamazonicos/

The source repository and its Pages publication are not modified.
Files under `amazon-crimes/netlify` are kept for archival/source fidelity only;
the GitHub Pages workflow serves the static frontend and public snapshots.

The deployment workflow generates cached public environmental/geographic snapshots
from external GIS and OSINT sources. External services and some live streams may
be unavailable independently of the repository copy.
