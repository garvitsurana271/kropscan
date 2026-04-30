import sys
from pathlib import Path

pdf_path = r'c:\Users\Garvit Surana\Desktop\Projects\HackDays-4.0\hackathon_problem_statememt.pdf'

# Try multiple PDF libraries
extracted = None

try:
    from pypdf import PdfReader
    r = PdfReader(pdf_path)
    print(f'Total pages: {len(r.pages)}')
    print('=' * 80)
    for i in range(len(r.pages)):
        print(f'\n--- PAGE {i+1} ---\n')
        print(r.pages[i].extract_text())
    extracted = 'pypdf'
except ImportError:
    pass
except Exception as e:
    print(f'pypdf failed: {e}', file=sys.stderr)

if not extracted:
    try:
        import PyPDF2
        r = PyPDF2.PdfReader(pdf_path)
        print(f'Total pages: {len(r.pages)}')
        print('=' * 80)
        for i in range(len(r.pages)):
            print(f'\n--- PAGE {i+1} ---\n')
            print(r.pages[i].extract_text())
        extracted = 'PyPDF2'
    except ImportError:
        pass
    except Exception as e:
        print(f'PyPDF2 failed: {e}', file=sys.stderr)

if not extracted:
    try:
        import fitz  # pymupdf
        doc = fitz.open(pdf_path)
        print(f'Total pages: {len(doc)}')
        print('=' * 80)
        for i, page in enumerate(doc):
            print(f'\n--- PAGE {i+1} ---\n')
            print(page.get_text())
        extracted = 'pymupdf'
    except ImportError:
        pass
    except Exception as e:
        print(f'pymupdf failed: {e}', file=sys.stderr)

if not extracted:
    print('No PDF library available. Install one with: pip install pypdf')
    sys.exit(1)
