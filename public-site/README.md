# Vector landing page

A static site with three views: Home (Platform, Industries, Healthcare, Compliance sections), Company (customers and team) and Contact.

## Run it
It is served by the Vector server at `/` (`npm start`, then http://127.0.0.1:8080/). It also opens as a plain file; fonts and the smooth-scroll library are bundled in `assets/`, so it works offline and on air-gapped networks.

## Edit it
- **Colours:** the `:root` variables at the top of the `<style>` block.
- **Industries:** the `IND` array in the script (law, medical, education, logistics, finance).
- **Customers and team:** the `data-page="company"` section. Photos go in `assets/clients/` (`mitwpu.jpg`, `mumbai-college.jpg`, `law-firm.jpg`, `hospitals.jpg`) and `assets/team/` (`suryansh.jpg`, `member2.jpg`). Missing photos show a placeholder.
- **Second team member:** search for "Co-founder name".

## Contact form
Posts JSON to `api/site/contact` on the Vector server, which stores it locally (operator accounts can read it at `GET /api/site/leads`). Change `FORM_ENDPOINT` in the script to send it somewhere else when hosting the page separately.

## Before you publish
Every customer claim on the Company page should be one you can stand behind. Compliance figures are labelled as illustrative; keep that wording.

## Licences
Space Grotesk, Inter and JetBrains Mono (SIL OFL) and Lenis (MIT) are bundled with their licence files.
