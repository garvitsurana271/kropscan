"""Windows-safe wrapper for PDDD training"""
import multiprocessing

if __name__ == '__main__':
    multiprocessing.freeze_support()
    exec(open('scripts/train_pddd.py', encoding='utf-8').read())
