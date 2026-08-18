import './quota-guard.js';
import './investment-ui.js';

// Die sichtbare Oberfläche wird absichtlich nicht mehr per JavaScript umsortiert.
// Keine versteckten Hauptbereiche, keine konkurrierenden Grid-Wrapper, keine
// dynamisch nachgeladenen Layout-Hotfixes. rescue-ui.css ist direkt in index.html
// eingebunden und hat als einzige zusätzliche Layout-Schicht Vorrang vor styles.css.
