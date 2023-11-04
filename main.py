import os
import pandas as pd
from pathlib import Path

def txt_files_to_df(dir_path):
    data = []
    for root, dirs, files in os.walk(dir_path):
        for file in files:
            if file.endswith('.txt'):
                with open(os.path.join(root, file), 'r') as f:
                    content = f.read()
                data.append({'file_name': file, 'description': content})
    df = pd.DataFrame(data)
    return df


df = txt_files_to_df(f'{Path.home()}/TimeTree')
df.columns