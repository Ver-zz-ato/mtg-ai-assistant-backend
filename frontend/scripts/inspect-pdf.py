#!/usr/bin/env python3
"""
Inspect the PDF structure to understand how test cases are formatted.

This script will extract text from the PDF and print it so you can see
the structure and write the parsing logic.

Usage:
    python inspect-pdf.py
"""

import pdfplumber
import sys
import os

# Path to PDF
PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'Magic_ The Gathering AI Deck Analysis Test Cases.pdf')

def main():
    if not os.path.exists(PDF_PATH):
        print(f"PDF not found at: {PDF_PATH}")
        print(f"Current directory: {os.getcwd()}")
        sys.exit(1)
    
    print(f"Reading PDF: {PDF_PATH}")
    print("=" * 80)
    
    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"Total pages: {len(pdf.pages)}\n")
        
        # Extract text from first few pages to see structure
        num_pages_to_show = min(3, len(pdf.pages))
        
        for i in range(num_pages_to_show):
            page = pdf.pages[i]
            text = page.extract_text()
            
            print(f"\n{'='*80}")
            print(f"PAGE {i+1}")
            print(f"{'='*80}\n")
            print(text)
            print("\n")
        
        # Also try to get tables if present
        print("\n" + "="*80)
        print("CHECKING FOR TABLES (first page only)")
        print("="*80)
        first_page = pdf.pages[0]
        tables = first_page.extract_tables()
        if tables:
            print(f"Found {len(tables)} table(s) on first page")
            for j, table in enumerate(tables[:1]):  # Show first table only
                print(f"\nTable {j+1}:")
                for row in table[:10]:  # First 10 rows
                    print(row)
        else:
            print("No tables found on first page")
        
        # Save full text to file for inspection
        output_file = "pdf-extracted-text.txt"
        print(f"\n{'='*80}")
        print(f"Saving full text to: {output_file}")
        print("="*80)
        
        full_text = '\n'.join(page.extract_text() for page in pdf.pages)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(full_text)
        
        print(f"\n✅ Saved {len(full_text)} characters to {output_file}")
        print(f"   Review this file to understand the PDF structure")
        print(f"   Then modify convert-pdf-tests.py to parse it correctly")

if __name__ == "__main__":
    main()
