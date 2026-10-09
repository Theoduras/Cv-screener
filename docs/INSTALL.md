# CV Screener installeren (voor testers)

Een Chrome-extensie die grote stapels cv's leest, sorteert en filtert. Daarnaast wijst hij aan welke cv's waarschijnlijk door een AI-tool zijn geschreven. Hij werkt naast elk ATS (Oleeo en andere). **Alle cv's blijven in jouw browser.**

## 1. Installeren (2 minuten)

1. Download **cv-screener.zip** via de link die je hebt gekregen en **pak hem uit**: rechtsklik → *Alles uitpakken*. Je krijgt een map `cv-screener`.
2. Open Chrome (of Edge) en ga naar `chrome://extensions` (Edge: `edge://extensions`).
3. Zet rechtsboven **Ontwikkelaarsmodus** aan.
4. Klik op **Uitgepakte extensie laden** en kies de uitgepakte map, dus de map waar `manifest.json` in staat.
5. Klik op het puzzelstukje naast de adresbalk en zet de **punaise** aan bij *CV Screener*.

> Zie je bij *Uitgepakte extensie laden* een foutmelding? Dan heb je waarschijnlijk de zip zelf gekozen of een map te hoog. Kies de map met `manifest.json` erin.
>
> Op een werklaptop kan IT ontwikkelaarsmodus hebben geblokkeerd. Vraag dan of `chrome://extensions` voor jou open mag.

## 2. Gebruiken

**Cv's toevoegen**
- Klik op het CV Screener-icoon en kies **Open screener**.
- Sleep cv's (PDF, DOCX of TXT) of een hele map in het vak. Vul eventueel eerst het vacature-/req-nummer in, dan kun je er later op filteren.
- Of open een kandidaat in je ATS (bijv. Oleeo), klik op het icoon en kies **Pak kandidaat van deze pagina**. De extensie haalt de bijlagen van die pagina op met jouw eigen login. Zit er geen bijlage op, dan gebruikt hij de tekst van de pagina.

**Filteren en sorteren**
- Je kunt zoeken op naam, e-mail of tekst, en filteren op locatie, taal, skills (alle of één ervan), jaren ervaring, AI-score en vacature.
- Klik op een kolomkop om te sorteren. Klik op een kandidaat voor de details en de volledige tekst.
- Met **Exporteer CSV** download je de gefilterde lijst. Die opent direct in Excel.
- Onder **Eigen skills** voeg je vaardigheden toe die nog niet herkend worden.

**De AI-score (0–100)**
- Groen (< 25) betekent weinig signalen, oranje (25–54) een aantal, rood (≥ 55) veel.
- Zet je muis op de score of open de kandidaat om te zien *waarom*. Signalen zijn bijvoorbeeld typische AI-woorden ("results-driven", "gedreven", "proven track record"), vergeten sjabloontekst zoals "[Bedrijfsnaam]", heel gelijkmatige zinnen, de PDF-maker en precies dezelfde tekst als bij een andere sollicitant.
- **Het is een indicatie, geen bewijs.** Gebruik de score om te prioriteren, niet om iemand af te wijzen.

## 3. Privacy

- Cv's en kandidaatgegevens worden nergens naartoe gestuurd. Ze staan alleen in deze browser.
- Gaat er iets mis, dan wordt **alleen de foutmelding** anoniem naar de ontwikkelaar gestuurd: geen namen, geen bestandsnamen en geen cv-tekst.
- Met **Wis alle cv's** (onderaan) maak je alles leeg.

## 4. Problemen melden

Fouten worden automatisch gemeld. Wil je zelf iets laten weten, gebruik dan de knop **Meld probleem** rechtsboven. Zet daar geen kandidaatgegevens in.

## 5. Bijwerken of verwijderen

- **Bijwerken:** pak de nieuwe zip uit over de oude map en klik op ↻ bij CV Screener in `chrome://extensions`. Je cv's blijven bewaard.
- **Verwijderen:** klik op *Verwijderen* in `chrome://extensions`. Daarmee worden ook alle opgeslagen cv's gewist.
