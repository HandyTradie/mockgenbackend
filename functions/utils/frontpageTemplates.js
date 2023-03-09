const latexEscape = require("./escape");

const templates = [
	{
		name: "Template 1",
		id: "template-1",
		generator: ({
			logoFileName,
			questionTypes,
			logoURL,
			examTitle,
			examDate,
			courseName,
			sectionType,
			schoolName,
			examInstructions,
			duration,
		}) => `
    \\documentclass{article}
    \\usepackage{geometry}
    \\usepackage[utf8]{inputenc}
    \\usepackage[T1]{fontenc}
    \\usepackage{textcomp}
    \\usepackage{amsmath}
    \\usepackage{amssymb}
    \\usepackage{soul}
    \\usepackage{graphicx}
     \\geometry{
     a4paper,
     total={170mm,257mm},
     left=20mm,
     top=20mm,
     }
    \\usepackage{booktabs}
    \\usepackage{array}
    \\usepackage{tabularx}
    \\usepackage{tabulary}
    \\usepackage{multicol}
    \\setlength{\\columnsep}{35pt}
    \\setlength{\\arrayrulewidth}{1mm} 
    \\setlength{\\tabcolsep}{6pt} 
    \\renewcommand{\\arraystretch}{2} 
    \\tolerance=1
    \\emergencystretch=\\maxdimen
    \\hyphenpenalty=10000
    \\hbadness=10000
    \\begin{document}
    \\begin{tabular}{  m{7em}  }

    \\immediate\\write18{
      wget -O ${latexEscape(logoFileName)} ${latexEscape(logoURL)}
    }

    \\includegraphics[width=20mm,scale=1]{${latexEscape(logoFileName)}}

    \\end{tabular}
    \\begin{tabular}{ | m{5cm}  m{3cm}|  }

    \\hline
        
      \\parbox[m]{10cm}{\\vspace*{8pt} \\textbf{\\large ${examTitle ? examTitle.replace(/\_/g, "\\_") : ""}}\\newline ${latexEscape(
			examDate
		)}\\newline ${
			courseName && courseName.length > 0 ? courseName.replace(/\&/g, "\\&") : ""
		}\\newline ${sectionType}\\newline  ${duration.toFixed(1)} hours \\vspace*{4pt}} & \\hfill {\\textbf{\\huge ${questionTypes.join(
			" \\& "
		)}}} \\\\
        
        \\hline
      \\end{tabular}
        \\begin{tabular}{  m{7em}  }

        \\parbox[m]{15cm}{\\hspace*{0.5cm}Name:.......................... 
          \\vspace*{1pt}} \\
            \\parbox[m]{15cm}{\\hspace*{0.5cm}Index Number:.......................... 
          \\vspace*{1pt}}

      \\end{tabular}
    \\begin{center}
    ${latexEscape(examTitle)}
    \\end{center}
    \\begin{center}
    ${latexEscape(schoolName)}
    \\end{center}
    ${latexEscape(examDate)} \\hfill ${latexEscape(examTitle)} \\hfill ${duration.toFixed(1)}HOURS
    \\begin{center}
    ${examInstructions}
    \\end{center}
    \\pagebreak
    `,
	},
	{
		name: "Template 2",
		id: "template-2",
		generator: ({ questionTypes, examTitle, examDate, courseName, schoolName, examInstructions, duration }) => {
			// Generate "1 & 2" style string
			const questionTypesArr = questionTypes.map((questionType) => `\\scalebox{3.5}{${questionType}}`);
			const questionTypesString = questionTypesArr.join(" \\scalebox{3.5}{\\&} ");

			return `
      \\documentclass{article}
\\usepackage{geometry}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{textcomp}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{anyfontsize}
\\usepackage{soul}
\\usepackage{graphicx}
\\usepackage[absolute,overlay]{textpos}
\\geometry{
	a4paper,
	total={170mm,257mm},
	left=20mm,
	right=20mm,
	top=10mm,
  bottom=15mm
}
\\usepackage{booktabs}
\\usepackage{array}
\\usepackage{tabularx}
\\usepackage{tabulary}
\\usepackage{multicol}
\\usepackage{tabularx}
\\setlength{\\columnsep}{35pt}
\\setlength{\\arrayrulewidth}{1mm}
\\setlength{\\tabcolsep}{6pt}
\\setlength\\parindent{0pt}
\\renewcommand{\\arraystretch}{2}


\\begin{document}
\\noindent 
\\begin{tabular}{@{}| m{6.5cm} |@{}}
\\hline
\\textbf{${examTitle ? examTitle.replace(/\_/g, "\\_") : ""}}
\\newline ${latexEscape(examDate)}
\\newline

\\begin{tabular}{@{}ll@{}}
\\parbox{2.8cm}{\\raggedright ${latexEscape(courseName)}
\\newline
\\newline ${duration.toFixed(1)} hours
} & {
  \\parbox{3cm} {
    \\raggedleft
    \\textbf{${questionTypesString}}
  }
} 
\\end{tabular}

\\vspace{0.2cm}
\\\\
\\hline
\\end{tabular}
\\hspace{0.2cm}
\\setlength{\\arrayrulewidth}{0.2mm}
\\resizebox{9.4cm}{3cm}{\\begin{tabular}{|cc|}
	\\hline
	\\multicolumn{2}{|c|}{CANDIDATE'S  NAME}            \\\\ \\hline
	\\multicolumn{2}{|c|}{}                             \\\\ \\hline
	\\multicolumn{1}{|c|}{INDEX NUMBER} & DATE          \\\\ \\hline
	\\multicolumn{1}{|c|}{}             &               \\\\ \\hline
	\\multicolumn{1}{|c|}{SIGNATURE}    & CENTER NUMBER \\\\ \\hline
	\\multicolumn{1}{|c|}{}             &               \\\\ \\hline
\\end{tabular}}
	
\\vspace{1.2cm}

\\begin{center}\\textbf{\\Large{${latexEscape(schoolName)}}}\\end{center}
\\begin{center}\\textbf{${examTitle ? examTitle.replace(/\_/g, "\\_") : ""}}\\end{center}

\\vspace{0.5cm}

\\textbf{${latexEscape(examDate)}} 
\\hfill 
\\parbox[t]{7cm}{\\centering ${latexEscape(courseName)}}
\\hfill \\textbf{${duration.toFixed(1)} HOURS}

\\vspace{4cm}

\\begin{minipage}[b]{11cm}
\\noindent
\\obeylines
${examInstructions}
\\end{minipage} \\hfill
\\begin{tabular}{|cc|}
	\\vspace*{-3cm} \\\\
	\\hline
	\\multicolumn{2}{|c|}{FOR EXAMINERS USE ONLY}                   \\\\ \\hline
	\\multicolumn{1}{|c|}{Question  Number} & Marks                 \\\\ \\hline
	\\multicolumn{1}{|c|}{}                 &                       \\\\[15pt] \\hline
	\\multicolumn{1}{|c|}{}                 &                       \\\\[15pt] \\hline
	\\multicolumn{1}{|c|}{}                 &                       \\\\[15pt] \\hline
	\\multicolumn{1}{|c|}{}                 &                       \\\\[15pt] \\hline
	\\multicolumn{1}{|l|}{}                 & \\multicolumn{1}{l|}{} \\\\[15pt] \\hline
	\\multicolumn{1}{|l|}{}                 & \\multicolumn{1}{l|}{} \\\\[15pt] \\hline
	\\multicolumn{1}{|l|}{}                 & \\multicolumn{1}{l|}{} \\\\[15pt] \\hline
	\\multicolumn{1}{|l|}{TOTAL}            & \\multicolumn{1}{l|}{} \\\\[15pt] \\hline
\\end{tabular}

\\begin{center}NUMBER YOUR ANSWERS\\end{center}
\\fbox{\\rule{16.8cm}{0pt}\\rule[-0.5ex]{0pt}{6ex}}

\\pagebreak  


    `;
		},
	},
	{
		name: "Template 3",
		id: "template-3",
		generator: ({ logoFileName, logoURL, examTitle, examDate, courseName, schoolName, examInstructions, duration }) => `
    \\documentclass{article}
    \\usepackage{geometry}
    \\usepackage[utf8]{inputenc}
    \\usepackage[T1]{fontenc}
    \\usepackage{textcomp}
    \\usepackage{amsmath}
    \\usepackage{amssymb}
    \\usepackage{soul}
    \\usepackage{graphicx}
    \\geometry{
      a4paper,
      total={170mm,257mm},
      left=20mm,
      top=20mm,
    }
    \\usepackage{booktabs}
    \\usepackage{array}
    \\usepackage{tabularx}
    \\usepackage{tabulary}
    \\usepackage{multicol}
    \\usepackage{xcolor}
    \\usepackage{framed}
    \\setlength{\\columnsep}{35pt}
    \\setlength{\\arrayrulewidth}{1mm}
    \\setlength{\\tabcolsep}{6pt}
    \\setlength\\parindent{0pt}
    \\renewcommand{\\arraystretch}{2}
    \\tolerance=1
    \\emergencystretch=\\maxdimen
    \\hyphenpenalty=10000
    \\hbadness=10000
    
    \\newenvironment{myshaded}
    {\\def\\FrameCommand{\\fboxsep=\\topsep\\colorbox{gray!20}}%
      \\MakeFramed {\\advance\\hsize-\\width \\FrameRestore}}%
    {\\endMakeFramed}
    
    
    \\begin{document}
    \\begin{tabular}{  m{7em}  }
    \\immediate\\write18{
      wget -O ${latexEscape(logoFileName)} ${latexEscape(logoURL)}
    }
    \\includegraphics[width=25mm,scale=1]{${latexEscape(logoFileName)}}
    \\begin{center}
      \\textbf {\\large ${latexEscape(examDate)}}
    \\end{center}
    \\end{tabular}
    \\hspace{1cm}
    \\begin{minipage}{10cm}
    
    \\begin{center} \\textbf{\\Large 
          \\parbox{10cm}{\\centering \\underline{ ${latexEscape(schoolName)}}}} \\end{center}
    \\begin{myshaded}\\begin{center}\\textbf{\\Large ${latexEscape(examTitle)}}\\end{center}\\end{myshaded}
    
    \\begin{center}\\textbf{\\Large ${latexEscape(courseName)}} \\end{center}
    \\end{minipage}
    
    \\vspace{1cm}
    
    \\textbf{\\large ${latexEscape(courseName)}} \\hfill \\textbf{\\large TIME: ${duration.toFixed(1)} HOURS}
    
    \\vspace{0.5cm}
    
    \\begin{minipage}{168mm}
    \\emph{\\large ${examInstructions} }	
    \\end{minipage}

    \\vspace{1.5cm}

    
    `,
	},
	{
		name: "Template 4",
		id: "template-4",
		generator: ({ logoFileName, logoURL, examTitle, examDate, courseName, schoolName, examInstructions, duration }) => `
    \\documentclass{article}
\\usepackage{geometry}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{textcomp}
\\usepackage{amsmath, empheq}
\\usepackage{amssymb}
\\usepackage{soul}
\\usepackage{graphicx}
\\geometry{
	a4paper,
	total={170mm,257mm},
	left=10mm,
	right=10mm,
	top=10mm,
	bottom=15mm
}
\\usepackage{booktabs}
\\usepackage{array}
\\usepackage{tabularx}
\\usepackage{tabulary}
\\usepackage{multicol}
\\usepackage{xcolor}
\\usepackage[most]{tcolorbox}
\\usepackage{framed}
\\usepackage{qrcode}
\\setlength{\\columnsep}{35pt}
\\setlength{\\arrayrulewidth}{1mm}
\\setlength{\\tabcolsep}{6pt}
\\setlength\\parindent{0pt}
\\renewcommand{\\arraystretch}{2}
\\tolerance=1
\\emergencystretch=\\maxdimen
\\hyphenpenalty=10000
\\hbadness=10000

\\newtcolorbox{myframe}[1][]{
	enhanced,
	arc=0pt,
	outer arc=0pt,
	colback=white,
	boxrule=0.8pt,
	#1
}

\\begin{document}
\\Large{Date: ${latexEscape(examDate)}} \\hfill \\Large{Duration: ${duration.toFixed(1)} HOURS}

\\vspace{1.5cm}
	
\\begin{myframe}[top=15pt,bottom=15pt]
\\begin{tabular}{ m{7em} }
	\\immediate\\write18{
    wget -O ${latexEscape(logoFileName)} ${latexEscape(logoURL)}
	}
	\\includegraphics[width=25mm,scale=1]{${latexEscape(logoFileName)}}
\\end{tabular}
\\hspace{0.7cm}
\\begin{minipage}{10cm}
	\\begin{center} \\textbf{\\Large \\parbox{10cm}{\\centering ${latexEscape(schoolName)}}} \\end{center}
	\\begin{center}${latexEscape(examTitle)}\\end{center}
	\\begin{center}${latexEscape(courseName)}\\end{center}
\\end{minipage}

\\vspace{1.5cm}

\\hspace{2cm}
Student Name:..............................
\\hfill
Index Number:..............................
\\end{myframe}	

\\vspace{1cm}

\\vspace{0.5cm}	

\\begin{center}
	\\emph{
		\\large {
			${examInstructions}	
		}
	}
\\end{center}


\\vfill

\\qrcode[height=1.3in]{https://mockgenupgrades.web.app}

\\pagebreak
    `,
	},
	{
		name: "Template 5",
		id: "template-5",
		generator: ({ logoFileName, logoURL, examTitle, examDate, courseName, schoolName, examInstructions, duration }) => `
    \\documentclass{article}
    \\usepackage{geometry}
    \\usepackage[utf8]{inputenc}
    \\usepackage[T1]{fontenc}
    \\usepackage{textcomp}
    \\usepackage{amsmath, empheq}
    \\usepackage{amssymb}
    \\usepackage{soul}
    \\usepackage{graphicx}
    \\geometry{
      a4paper,
      total={170mm,257mm},
      left=10mm,
      right=10mm,
      top=20mm,
      bottom=15mm
    }
    \\usepackage{booktabs}
    \\usepackage{array}
    \\usepackage{tabularx}
    \\usepackage{tabulary}
    \\usepackage{multicol}
    \\usepackage{xcolor}
    \\usepackage[most]{tcolorbox}
    \\usepackage{framed}
    \\usepackage{qrcode}
    \\setlength{\\columnsep}{35pt}
    \\setlength{\\arrayrulewidth}{1mm}
    \\setlength{\\tabcolsep}{6pt}
    \\setlength\\parindent{0pt}
    \\renewcommand{\\arraystretch}{2}
    \\tolerance=1
    \\emergencystretch=\\maxdimen
    \\hyphenpenalty=10000
    \\hbadness=10000
    
    
    
    \\begin{document}
      \\Large{Student Name:..............................} \\hfill \\Large{Index Number:..............................}
      
      \\vspace{3.5cm}
      
    
        \\begin{center}
          \\immediate\\write18{
            wget -O ${latexEscape(logoFileName)} ${latexEscape(logoURL)}

          }
          \\includegraphics[width=25mm,scale=1]{${latexEscape(logoFileName)}}
        \\end{center}
        \\hspace{0.7cm}
        \\begin{center}
          \\begin{center} \\textbf{\\Large \\parbox{10cm}{\\centering ${latexEscape(schoolName)}}} \\end{center}
          \\begin{center}${latexEscape(examTitle)}\\end{center}
          \\begin{center}${latexEscape(courseName)}\\end{center}
          \\begin{center}${latexEscape(examDate)}\\end{center}
          \\begin{center}${duration.toFixed(1)} HOURS\\end{center}
        \\end{center}
        
        
        \\hspace{2cm}
        
        \\hfill
      
      \\vspace{0.5cm}	
      
      \\begin{center}
    
          \\large {
            ${examInstructions}
          }
        
      \\end{center}
      
      
      \\vfill
      
      \\qrcode[height=1.3in]{https://mockgenupgrades.web.app}
      
      \\pagebreak
    `,
	},
	{
		name: "Template 6",
		id: "template-6",
		generator: ({ questionTypes, examTitle, examDate, courseName, schoolName, examInstructions, duration }) => {
			// Generate "1 & 2" style string
			const questionTypesArr = questionTypes.map((questionType) => `\\scalebox{5}{${questionType}}`);
			const questionTypesString = questionTypesArr.join(" \\scalebox{5}{\\&} ");

			return `
    \\documentclass{article}
\\usepackage{geometry}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{textcomp}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{anyfontsize}
\\usepackage{soul}
\\usepackage{graphicx}
\\usepackage[absolute,overlay]{textpos}
\\geometry{
	a4paper,
	total={170mm,257mm},
	left=20mm,
	right=20mm,
	top=20mm,
}
\\usepackage{booktabs}
\\usepackage{array}
\\usepackage{tabularx}
\\usepackage{tabulary}
\\usepackage{multicol}
\\setlength{\\columnsep}{35pt}
\\setlength{\\arrayrulewidth}{1mm}
\\setlength{\\tabcolsep}{6pt}
\\setlength\\parindent{0pt}
\\renewcommand{\\arraystretch}{2}

\\begin{document}

\\noindent
\\begin{tabular}{@{}| m{8cm} |@{}}
\\hline
\\textbf{${latexEscape(examTitle)}}
\\newline ${latexEscape(examDate)}
\\newline

\\begin{tabular}{@{}ll@{}}
\\parbox{3.6cm}{${latexEscape(courseName)}
\\newline
\\newline ${duration.toFixed(1)} hours
} & {
  \\parbox{4cm} {
    \\raggedleft
    \\textbf{${questionTypesString}}
  }
}
\\end{tabular}

\\vspace{0.2cm}
\\\\
\\hline
\\end{tabular}
\\hspace{2.3cm}
\\begin{tabular}{ m{6cm}}
Name:.................................................
\\newline
\\newline
Index Number:....................................
\\end{tabular}

\\vspace{1.5cm}

\\begin{center}\\textbf{\\Large{${latexEscape(schoolName)}}}\\end{center}
\\begin{center}\\textbf{${latexEscape(examTitle)}}\\end{center}

\\vspace{0.5cm}

\\textbf{${latexEscape(examDate)}}
\\hfill
\\parbox[t]{7cm}{\\centering ${latexEscape(courseName)}}
\\hfill \\textbf{${duration.toFixed(1)} HOURS}

\\vspace{1.5cm}

${examInstructions}

\\pagebreak  
`;
		},
	},
];

// \\noindent
// \\obeylines

// \\begin{minipage}
// ${examInstructions}

// \\end{minipage}

module.exports = { templates };
