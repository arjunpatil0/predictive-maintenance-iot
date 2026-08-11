# export_context.py
import os

# Define folders to ignore
IGNORE_FOLDERS = {'.venv', 'node_modules', '.git', 'dist', '__pycache__'}

# Define specific large binary files or lock files to ignore
IGNORE_FILES = {
    'package-lock.json', 
    'rul_reg.joblib', 
    'failure_clf.joblib', 
    'scaler.joblib', 
    'label_encoder.joblib',
    'export_context.py',
    'codebase_context.md'
}

# Define text-based extensions to include
INCLUDE_EXTENSIONS = {
    '.py', '.ts', '.tsx', '.json', '.md', '.css', '.html', '.sh', '.ps1'
}

def generate_context():
    project_root = os.path.dirname(os.path.abspath(__file__))
    output_file = os.path.join(project_root, 'codebase_context.md')
    
    print(f"Packing codebase context from: {project_root}...")
    
    with open(output_file, 'w', encoding='utf-8') as outfile:
        # Write Title and Intro
        outfile.write("# IIoT Predictive Maintenance Project Codebase Context\n\n")
        outfile.write("This file contains the complete codebase context for the IIoT Predictive Maintenance project. ")
        outfile.write("It includes the directory structure and the contents of all custom code, configurations, and setup scripts.\n\n")
        
        # Write Folder Tree
        outfile.write("## 📂 Folder Structure\n```text\n")
        for root, dirs, files in os.walk(project_root):
            # Prune ignored folders in-place
            dirs[:] = [d for d in dirs if d not in IGNORE_FOLDERS]
            
            level = root.replace(project_root, '').count(os.sep)
            indent = ' ' * 4 * level
            outfile.write(f"{indent}{os.path.basename(root)}/\n")
            subindent = ' ' * 4 * (level + 1)
            for f in files:
                if f not in IGNORE_FILES:
                    outfile.write(f"{subindent}{f}\n")
        outfile.write("```\n\n")
        
        # Write File Contents
        outfile.write("## 📝 Source Code & Configurations\n\n")
        for root, dirs, files in os.walk(project_root):
            dirs[:] = [d for d in dirs if d not in IGNORE_FOLDERS]
            
            for file in files:
                if file in IGNORE_FILES:
                    continue
                
                _, ext = os.path.splitext(file)
                if ext.lower() in INCLUDE_EXTENSIONS:
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, project_root)
                    
                    print(f"Adding file: {rel_path}")
                    
                    outfile.write(f"### 📄 File: `{rel_path}`\n\n")
                    
                    # Detect markdown syntax highlighting language
                    lang = ext.replace('.', '')
                    if lang == 'tsx' or lang == 'ts':
                        lang = 'typescript'
                    elif lang == 'py':
                        lang = 'python'
                    elif lang == 'sh':
                        lang = 'bash'
                    elif lang == 'ps1':
                        lang = 'powershell'
                    
                    outfile.write(f"```{lang}\n")
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f_in:
                            outfile.write(f_in.read())
                    except Exception as e:
                        outfile.write(f"[ERROR READING FILE: {str(e)}]")
                    
                    outfile.write("\n```\n\n---\n\n")
                    
    print(f"\nSuccess! Codebase packed into single file: {output_file}")

if __name__ == '__main__':
    generate_context()
