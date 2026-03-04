export const DATA_TYPE_DESCRIPTIONS = {
    "Uncategorized": "NDA default category (Clinical Assessments) — structures not assigned a specific classification",
    "Behavioral Task": "Performance-based measures of cognitive, emotional, social, or behavioral processes (e.g., attention, memory, decision-making, reward sensitivity)",
    "Self-report": "Self-administered surveys or questionnaires capturing subjective states, feelings, thoughts, and past behaviors (e.g., BDI, STAI)",
    "Clinical Assessment": "Clinician-administered measures of psychological, biological, and social factors, including structured/semi-structured interviews and psychodiagnostic tools (e.g., K-SADS, SCID)",
    "Neurocognitive Assessment": "Standardized, normed tests measuring cognitive domains such as memory, attention, processing speed, and executive functioning (e.g., NIH Toolbox, Wechsler scales)",
    "Audio/Video (AV)": "Digital recordings of speech, vocal characteristics, facial expressions, and body movements used as behavioral and affective signals",
    "Electronic Health Record": "Longitudinal patient medical records including diagnoses, medications, lab tests, and clinical notes from healthcare providers",
    "Passive Sensor": "Passively collected data from smartphones or wearables: heart rate, sleep, activity, skin conductance, and geolocation",
    "Neurosignal Recordings": "Measures of brain structure and/or function derived from MRI, EEG, PET, and related neuroimaging modalities",
    "Omics": "Genetic and molecular data including genomics, proteomics, metabolomics, and epigenomics",
};

export const getDataTypeTooltip = (name) => {
    const desc = DATA_TYPE_DESCRIPTIONS[name];
    return desc ? `${name}: ${desc}` : null;
};
