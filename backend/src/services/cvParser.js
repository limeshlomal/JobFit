const { PDFParse } = require('pdf-parse');

class CVParser {
  static async parseCV(buffer) {
    let parser;
    try {
      parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      const text = data.text;

      const parsed = {
        fullName: this.extractName(text),
        email: this.extractEmail(text),
        phone: this.extractPhone(text),
        skills: this.extractSkills(text),
        experience: this.extractExperience(text),
        education: this.extractEducation(text),
        rawText: text.substring(0, 500), // First 500 chars
      };

      return parsed;
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error('Failed to parse PDF');
    } finally {
      if (parser) await parser.destroy();
    }
  }

  static extractName(text) {
    const lines = text.split('\n');
    return lines[0]?.trim() || 'Unknown';
  }

  static extractEmail(text) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const match = text.match(emailRegex);
    return match ? match[0] : null;
  }

  static extractPhone(text) {
    const phoneRegex = /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const match = text.match(phoneRegex);
    return match ? match[0] : null;
  }

  static extractSkills(text) {
    const skillKeywords = [
      'JavaScript', 'Python', 'Java', 'C++', 'SQL', 'React', 'Node.js',
      'Project Management', 'Leadership', 'Communication', 'Data Analysis',
      'Machine Learning', 'AWS', 'Azure', 'Git', 'Docker', 'Kubernetes',
      'Agile', 'Scrum', 'REST API', 'GraphQL', 'MongoDB', 'PostgreSQL'
    ];

    const skills = [];
    const lowerText = text.toLowerCase();

    skillKeywords.forEach((skill) => {
      if (lowerText.includes(skill.toLowerCase())) {
        skills.push(skill);
      }
    });

    return [...new Set(skills)];
  }

  static extractExperience(text) {
    const experiences = [];
    const lines = text.split('\n');
    
    // Simple extraction - look for common job title keywords
    const jobTitles = ['Manager', 'Developer', 'Engineer', 'Analyst', 'Consultant', 'Designer'];
    
    lines.forEach((line) => {
      jobTitles.forEach((title) => {
        if (line.includes(title)) {
          experiences.push({
            jobTitle: line.trim(),
            company: 'Unknown',
            description: line.trim(),
          });
        }
      });
    });

    return experiences.slice(0, 5); // Return first 5
  }

  static extractEducation(text) {
    const education = [];
    const degreeKeywords = ['Bachelor', 'Master', 'PhD', 'Associate', 'MBA', 'B.S', 'B.A', 'M.S', 'M.A'];

    degreeKeywords.forEach((degree) => {
      if (text.includes(degree)) {
        education.push({
          degree: degree,
          school: 'Unknown',
          year: null,
        });
      }
    });

    return education;
  }

  static calculateATSScore(parsedCV) {
    let score = 50;

    if (parsedCV.fullName && parsedCV.fullName !== 'Unknown') score += 10;
    if (parsedCV.email) score += 10;
    if (parsedCV.phone) score += 10;
    if (parsedCV.skills && parsedCV.skills.length >= 5) score += 15;
    if (parsedCV.experience && parsedCV.experience.length > 0) score += 20;
    if (parsedCV.education && parsedCV.education.length > 0) score += 15;

    return Math.min(100, score);
  }
}

module.exports = CVParser;