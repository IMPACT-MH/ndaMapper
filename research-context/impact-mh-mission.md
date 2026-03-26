# IMPACT-MH: Integrated Mental Health Platform for Advancing Clinical Translation

## Mission
IMPACT-MH is a federated mental health research platform that aggregates longitudinal clinical and biological data from multiple research sites across the United States. The platform supports the NIMH mission by facilitating data sharing, reproducibility, and cross-site meta-analyses in psychiatric and neurodevelopmental research.

## Research Domains
- **Mood disorders**: Major depressive disorder (MDD), bipolar spectrum
- **Anxiety disorders**: GAD, PTSD, social anxiety, panic
- **Neurodevelopmental**: ADHD, autism spectrum disorder (ASD)
- **Psychotic disorders**: Schizophrenia, schizoaffective disorder
- **Substance use**: Alcohol, cannabis, opioid use disorders
- **Adolescent mental health**: Child and adolescent samples (ages 6–18)
- **Biomarkers**: Neuroimaging (fMRI, sMRI, DTI), EEG, genomics, proteomics

## Population
Cross-sectional and longitudinal cohorts spanning:
- Ages 6 through adulthood
- Both clinical (diagnosed) and community/healthy control samples
- Diverse racial and ethnic groups
- Multiple geographic regions of the US

## Data Types Collected
- **Questionnaires / Self-report**: PHQ-9, GAD-7, BDI, STAI, DERS, and hundreds of validated scales
- **Clinician-rated measures**: HAMD, MADRS, PANSS, YMRS, CDRS
- **Cognitive / Neuropsychological**: WASI, RAVLT, Stroop, continuous performance tasks
- **Neuroimaging**: Structural MRI, resting-state fMRI, task fMRI
- **Biological**: Genetics, inflammatory markers, cortisol, autonomic measures
- **Demographic / Clinical history**: Medication, diagnosis, comorbidities

## Data Standards
All data is submitted in compliance with NIMH Data Archive (NDA) data structures and value range requirements. Each instrument maps to one or more NDA shortName identifiers (e.g., `gad701` for GAD-7, `phq901` for PHQ-9).

## How to Use This Context
When researchers ask questions about instruments, analyses, or cohort selection:
1. Use the NDA shortName identifiers when referencing specific instruments
2. Note which sites have collected a given instrument based on `submittedByProjects`
3. Be explicit when suggesting analyses that mock/synthetic data is used for planning — real data requires database access
4. Recommend instruments that are commonly co-administered for richer multi-domain analyses
