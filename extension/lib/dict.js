// Dictionaries for the heuristic parser. Lowercase; matched on word boundaries.

export const SKILLS = [
  // multi-word first so they win over their parts
  'machine learning','deep learning','data science','data analysis','data engineering','computer vision',
  'power bi','google cloud','google ads','lean six sigma','six sigma','project management','product management',
  'stakeholder management','account management','business development','online marketing','content marketing',
  'social media','supply chain','customer service','office management','ux design','ui design','grafisch ontwerp',
  'people management','ci/cd','next.js','node.js','scikit-learn','c#','c++','.net',
  'javascript','typescript','python','java','golang','rust','php','ruby','kotlin','swift','scala','matlab','sql','nosql',
  'html','css','sass','react','angular','vue','svelte','express','django','flask','spring','laravel',
  'aws','azure','gcp','docker','kubernetes','terraform','ansible','jenkins','git','github','gitlab','devops','linux',
  'postgresql','mysql','mongodb','oracle','redis','elasticsearch','kafka','spark','hadoop','airflow','dbt','snowflake','databricks',
  'tableau','looker','excel','vba','sap','salesforce','dynamics','hubspot','jira','confluence','servicenow','workday',
  'statistics','nlp','tensorflow','pytorch','pandas','numpy','llm',
  'scrum','agile','kanban','prince2','pmp','itil','lean','safe',
  'projectmanagement','programmamanagement','productmanagement','accountmanagement','sales','verkoop','acquisitie','marketing',
  'seo','sea','sem','copywriting','communicatie',
  'recruitment','werving','selectie','sourcing','hrm','personeelszaken','payroll','salarisadministratie','arbeidsrecht',
  'finance','financiën','boekhouding','accounting','controlling','audit','fiscaliteit','ifrs','gaap','budgettering',
  'inkoop','procurement','logistiek','planning','warehouse','voorraadbeheer','transport',
  'klantenservice','callcenter','receptie','administratie','secretariaat',
  'juridisch','legal','compliance','privacy','avg','gdpr','contractmanagement',
  'figma','sketch','photoshop','illustrator','indesign',
  'autocad','solidworks','revit','bim','werktuigbouwkunde','elektrotechniek','installatietechniek','plc',
  'verpleegkunde','begeleiding','ggz','jeugdzorg','onderwijs','coaching','training',
  'leidinggeven','teamleider',
];

export const CITIES = [
  'amsterdam','rotterdam','den haag','the hague',"'s-gravenhage",'utrecht','eindhoven','groningen','tilburg','almere',
  'breda','nijmegen','apeldoorn','haarlem','arnhem','enschede','amersfoort','zaanstad','zaandam','den bosch',"'s-hertogenbosch",
  'haarlemmermeer','hoofddorp','zwolle','zoetermeer','leiden','maastricht','dordrecht','ede','alphen aan den rijn',
  'leeuwarden','alkmaar','emmen','westland','delft','venlo','deventer','sittard','helmond','oss','hilversum','heerlen',
  'amstelveen','roosendaal','purmerend','schiedam','lelystad','spijkenisse','vlaardingen','gouda','hoorn','assen',
  'bergen op zoom','capelle aan den ijssel','veenendaal','katwijk','zeist','nieuwegein','hengelo','roermond','den helder',
  'doetinchem','middelburg','vlissingen','harderwijk','weert','kampen','woerden','houten','barneveld','diemen','rijswijk',
  'brussel','brussels','antwerpen','antwerp','gent','ghent','brugge','leuven','mechelen','hasselt','genk','luik','liège',
  'namen','charleroi','kortrijk','aalst','oostende',
  'berlin','düsseldorf','keulen','köln','aachen','münchen','hamburg','frankfurt','london','paris','parijs','madrid',
  'barcelona','lisbon','lissabon','dublin','warsaw','warschau','krakow','bucharest','boekarest','sofia','istanbul',
];

// first two postcode digits -> rough region city (NL)
export const POSTCODE_REGION = {
  10:'amsterdam',11:'amsterdam',12:'hilversum',13:'almere',14:'purmerend',15:'zaandam',16:'hoorn',17:'den helder',18:'alkmaar',19:'haarlem',
  20:'haarlem',21:'hoofddorp',22:'leiden',23:'leiden',24:'alphen aan den rijn',25:'den haag',26:'delft',27:'zoetermeer',28:'gouda',29:'capelle aan den ijssel',
  30:'rotterdam',31:'schiedam',32:'spijkenisse',33:'dordrecht',34:'nieuwegein',35:'utrecht',36:'utrecht',37:'zeist',38:'amersfoort',39:'veenendaal',
  40:'tiel',41:'culemborg',42:'gorinchem',43:'middelburg',44:'goes',45:'terneuzen',46:'bergen op zoom',47:'roosendaal',48:'breda',49:'oosterhout',
  50:'tilburg',51:'tilburg',52:'den bosch',53:'oss',54:'uden',55:'eindhoven',56:'eindhoven',57:'helmond',58:'venlo',59:'venlo',
  60:'weert',61:'sittard',62:'maastricht',63:'heerlen',64:'heerlen',65:'nijmegen',66:'wijchen',67:'ede',68:'arnhem',69:'arnhem',
  70:'doetinchem',71:'winterswijk',72:'zutphen',73:'apeldoorn',74:'deventer',75:'enschede',76:'almelo',77:'hardenberg',78:'emmen',79:'hoogeveen',
  80:'zwolle',81:'raalte',82:'lelystad',83:'emmeloord',84:'heerenveen',85:'joure',86:'sneek',87:'bolsward',88:'harlingen',89:'leeuwarden',
  90:'leeuwarden',91:'dokkum',92:'drachten',93:'groningen',94:'assen',95:'stadskanaal',96:'hoogezand',97:'groningen',98:'groningen',99:'delfzijl',
};

// canonical language -> spellings seen in CVs (nl/en/de/fr)
export const LANGUAGES = {
  Dutch: ['nederlands','dutch','niederländisch','néerlandais','vlaams','flemish'],
  English: ['engels','english','englisch','anglais'],
  German: ['duits','german','deutsch','allemand'],
  French: ['frans','french','französisch','français','francais'],
  Spanish: ['spaans','spanish','spanisch','espagnol','español'],
  Italian: ['italiaans','italian','italienisch','italien'],
  Portuguese: ['portugees','portuguese','portugiesisch'],
  Polish: ['pools','polish','polnisch','polski'],
  Turkish: ['turks','turkish','türkisch','türkçe'],
  Arabic: ['arabisch','arabic','arabe'],
  Romanian: ['roemeens','romanian','română'],
  Russian: ['russisch','russian','russe'],
  Ukrainian: ['oekraïens','oekraiens','ukrainian'],
  Chinese: ['chinees','chinese','mandarijn','mandarin'],
  Hindi: ['hindi'],
  Papiamento: ['papiamento','papiaments'],
};

export const STOPWORDS = {
  nl: ['de','het','een','en','van','ik','in','op','met','voor','bij','als','zijn','werkzaamheden','ervaring','jaar'],
  en: ['the','and','of','to','in','with','for','as','my','at','experience','responsible','years'],
  de: ['und','der','die','das','mit','für','bei','ich','von','erfahrung','jahre'],
  fr: ['et','le','la','les','des','pour','avec','dans','expérience','ans'],
};

// Phrases over-represented in LLM-written CVs and cover letters.
export const LLM_PHRASES = [
  // en
  'leverage','leveraging','leveraged','spearheaded','spearheading','proven track record','results-driven','results driven',
  'dynamic','fast-paced','fast paced','passionate about','delve','seamless','seamlessly','synergy','synergies',
  'cutting-edge','cutting edge','innovative solutions','detail-oriented','highly motivated','self-starter','go-getter',
  'thrive','thrives','thriving','foster','fostering','fostered','robust','holistic','meticulous','meticulously',
  'adept at','adept in','showcasing','showcase','pivotal','instrumental in','orchestrated','streamlined','streamlining',
  'navigate','navigating','landscape','ever-evolving','tapestry','realm','furthermore','moreover','in summary',
  'strong communication skills','excellent communication skills','team player','commitment to excellence',
  'drive impactful','impactful','actionable insights','stakeholder engagement','value-driven','customer-centric',
  'i am excited to','i am confident that','eager to contribute','make a meaningful impact','unwavering',
  'i am writing to express my interest','i am thrilled to','ideal fit','align perfectly','aligns perfectly','i look forward to the opportunity to discuss','valuable asset to your team',
  'met veel enthousiasme solliciteer ik','sluit naadloos aan','ideale kandidaat',
  'proactive mindset','proactive attitude','measurable results','data-driven insights','what distinguishes me',
  'what sets me apart','take ownership','i would welcome the opportunity','thank you for considering my application',
  'thank you for your time and consideration','positive attitude','engaging customer experiences','continue growing professionally',
  'grow professionally','fresh ideas','meaningful projects','creative thinking','connect with audiences','strong work ethic',
  'turn ideas into','changing priorities','successful outcomes','work collaboratively','working collaboratively',
  'i am particularly interested','contribute to your team','innovative campaigns','innovative marketing strategies',
  'excellent interpersonal skills','hit the ground running','wealth of experience','unique blend','passion for',
  'willingness to learn','continuous improvement','i am confident in my ability',
  'aantoonbare resultaten','meetbare resultaten','proactieve houding','uitdagende functie','mijn passie voor',
  // nl
  'gedreven','resultaatgericht','resultaatgerichte','proactief','proactieve','dynamische omgeving','in een dynamische',
  'passie voor','gepassioneerd','teamspeler','oplossingsgericht','klantgericht','klantgerichte','stressbestendig',
  'communicatief vaardig','sterke communicatieve vaardigheden','analytisch sterk','hands-on mentaliteit',
  'bewezen staat van dienst','toegevoegde waarde','naadloos','naadloze','synergie','innovatieve oplossingen',
  'ik ben ervan overtuigd','met veel enthousiasme','graag bijdragen','een waardevolle bijdrage','betekenisvolle impact',
  'daarnaast','bovendien','kortom','zorgvuldig','nauwgezet','veerkrachtig','scherp oog voor detail',
];

// Text that should never survive into a finished CV.
export const PLACEHOLDERS = [
  /\[(company|bedrijfs?naam|naam bedrijf|your name|uw naam|jouw naam|naam|job title|functietitel|date|datum|city|stad|phone|telefoon|email|e-mail)[^\]]*\]/i,
  /\bas an ai( language model)?\b/i, /\bals (een )?ai(-taalmodel)?\b/i,
  /\b(here is|hier is) (a|an|your|je|uw|een) (tailored |aangepaste )?(cv|resume|résumé|cover letter|motivatiebrief)\b/i,
  /\b(certainly|sure)!? here('s| is)\b/i, /\bzeker!? hier (is|volgt)\b/i,
  /\bfictional example\b/i, /\b(details|achievements|experience)[^.\n]{0,60}\bare placeholders\b/i,
  /linkedin\.com\/in\/(your-?name|yourname|firstname-?lastname)\b/i,
  /\blorem ipsum\b/i, /\{\{?\s*\w+\s*\}?\}/, /\bxx+(\/|-)xx+\b/i,
];

export const AI_PRODUCERS = /(chatgpt|openai|gpt-?\d|claude|gemini|bard|copilot|kickresume|rezi|resume\.io|zety|enhancv|teal|resumeworded|novoresume|cvmaker|jobscan|careerflow|huntr|wonsulting|aiapply|lazyapply|simplify)/i;

// Tools that send applications automatically and/or rewrite the CV per vacancy.
export const AUTO_APPLY = /(lazy ?apply|ai ?apply|sonara|job ?copilot|massive\.?app|loopcv|jobhire|simplify ?(copilot|jobs)?|bulk ?apply|auto[- ]?apply|apply ?pilot|jobright|jobsolv|wonsulting|careerflow|huntr)/i;
// File names / PDF titles that say the CV was generated for one specific vacancy.
export const TAILOR_FILE_HINT = /(tailor|optimi[sz]ed|ats[-_ ]?(friendly|optimi[sz]ed|ready)|for[-_ ]?(the[-_ ]?)?(job|vacancy|role|position)|job[-_ ]?match)/i;
// Text that tailoring tools leave behind.
export const TAILOR_ARTEFACTS = [
  /\bats[- ]?(friendly|optimi[sz]ed|compliant|ready)\b/i,
  /\btailored (to|for) (this|the|your) (role|position|job|vacancy|opening)\b/i,
  /\boptimi[sz]ed for (ats|the job description|this (role|position|vacancy))\b/i,
  /\b(based on|matching) the job description\b/i,
  /\bafgestemd op (deze|de) vacature\b/i,
];

// US spelling, which slips into ChatGPT text written for European applicants, and its British counterpart.
const ZE = 'organi|optimi|recogni|prioriti|speciali|reali|summari|utili|maximi|minimi|customi|standardi|visuali|finali|emphasi|mobili|categori|digitali';
export const US_SPELLING = new RegExp(`\\b(?:(?:${ZE})z(?:e|ed|es|ing|ation|ations)|analyz(?:e|ed|es|ing)|(?:colo|behavio|favo|hono)rs?|centers?)\\b`, 'giu');
export const UK_SPELLING = new RegExp(`\\b(?:(?:${ZE})s(?:e|ed|es|ing|ation|ations)|analys(?:e|ed|es|ing)|(?:colo|behavio|favo|hono)urs?|centres?|learnt|programmes?)\\b`, 'giu');
// Openings that address nobody in particular.
export const GENERIC_GREETING = /^\s*(dear (hiring manager|hiring team|recruit(er|ment team)|sir or madam|sir\/madam)|to whom it may concern|geachte heer\/mevrouw|geachte heer of mevrouw|geachte lezer)\b/im;
