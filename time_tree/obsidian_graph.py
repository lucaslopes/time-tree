import re
import json
import pandas as pd
import networkx as nx
import streamlit as st
from pathlib import Path
from pyvis.network import Network
from obsidiantools import api as otools
from streamlit.components import v1 as components

def get_time_tracking_data(directory) -> pd.DataFrame:
  md_files = list(directory.rglob('*.md'))
  time_tracker_dfs = list()
  for md_file in md_files:
    with open(md_file, 'r', encoding='utf-8') as file:
      content = file.read()
      pattern = re.compile(r'```simple-time-tracker(.*?)```', re.DOTALL)
      matches = pattern.findall(content)
      for match in matches:
        json_content = match.strip()
        try:
          data = json.loads(json_content)
          df_entries = pd.DataFrame(data['entries'])
          time_tracker_dfs.append(df_entries)
        except json.JSONDecodeError as e:
          st.error(f"Error decoding JSON in file {md_file}: {e}")
  time_tracker_df = pd.concat(time_tracker_dfs)
  time_tracker_df['name'] = time_tracker_df['name'].str[2:-2]
  time_tracker_df['startTime'] = pd.to_datetime(time_tracker_df['startTime'])
  time_tracker_df['endTime'] = pd.to_datetime(time_tracker_df['endTime'])
  time_tracker_df['duration'] = time_tracker_df['endTime'] - time_tracker_df['startTime']
  return time_tracker_df

VAULT_DIRECTORY = Path('/Users/lucas/Documents/TimeTree')
JOURNAL_DIRECTORY = VAULT_DIRECTORY / 'Journal'
vault = otools.Vault(VAULT_DIRECTORY).connect().gather()
df = vault.get_note_metadata()
time_tracker_df = get_time_tracking_data(JOURNAL_DIRECTORY)
time_tracker_df
nodes_list = df[df['rel_filepath'].astype(str).str.startswith('TimeTree/')].index.tolist()
G = vault.graph.subgraph(nodes_list).copy()

net = Network(
  notebook=False,
  height='420px',
  width='100%',
  bgcolor='#222222',
  font_color='white')

# Generate network with specific layout settings
net.repulsion(
  node_distance=420,
  central_gravity=0.33,
  spring_length=110,
  spring_strength=0.10,
  damping=0.95)

net.from_nx(G)
for e in net.edges:
  e['width'] = 1.5

st.title('Obsidian Graph')

# Load HTML content in the Streamlit component
components.html(net.generate_html(), height=435)