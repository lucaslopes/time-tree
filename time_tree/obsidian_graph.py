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


def calculate_accumulated_duration(G, target_node):
  """
  Calculates the accumulated duration for each node in the tree graph G,
  propagating the durations from the leaves up to the target_node.

  Parameters:
  G (networkx.Graph): The tree graph where each node has a 'duration' attribute.
  target_node: The label of the node where the accumulation stops.

  Returns:
  None: The function updates the 'accumulated_duration' attribute of the nodes in G.
  """

  # Initialize 'accumulated_duration' for all nodes
  for node in G.nodes:
    G.nodes[node]['accumulated_duration'] = G.nodes[node]['duration']

  # Perform post-order traversal to accumulate durations
  def post_order(node, parent):
    for neighbor in G.neighbors(node):
      if neighbor != parent:
        post_order(neighbor, node)
        # Add the accumulated duration of the child to the current node
        G.nodes[node]['accumulated_duration'] += G.nodes[neighbor]['accumulated_duration']

  # Start the traversal from the target_node
  post_order(target_node, None)


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


VAULT_DIRECTORY = Path('/Users/lucas/Documents/TimeTree')
JOURNAL_DIRECTORY = VAULT_DIRECTORY / 'Journal'
vault = otools.Vault(VAULT_DIRECTORY).connect().gather()
df = vault.get_note_metadata()
time_tracker_df = get_time_tracking_data(JOURNAL_DIRECTORY)
df_acc_time = time_tracker_df.groupby('name')['duration'].sum().reset_index()
df_acc_time = df_acc_time.set_index('name')['duration'].to_dict()
nodes_list = df[df['rel_filepath'].astype(str).str.startswith('TimeTree/')].index.tolist()


G = vault.graph.subgraph(nodes_list).copy()
for n in G.nodes:
  duration = df_acc_time.get(n, pd.Timedelta(0))
  G.nodes[n]['duration'] = duration.total_seconds()  # Convert to total seconds for JSON serialization
calculate_accumulated_duration(G, 'root')


weights = [G.nodes[n]['accumulated_duration'] for n in G.nodes]
min_weight, max_weight = min(weights), max(weights)
min_val, max_val = 2, 20
for e in G.edges:
  u, v, _ = e
  edge_duration = min(G.nodes[n]['accumulated_duration'], G.nodes[v]['accumulated_duration'])
  G.edges[e]['weight'] = min_val + (max_val - min_val) * (edge_duration - min_weight) / (max_weight - min_weight)


for n in G.nodes:
  G.nodes[n]['title'] = str(G.nodes[n]['accumulated_duration'])
  G.nodes[n]['size'] = min_val + (max_val - min_val) * (G.nodes[n]['accumulated_duration'] - min_weight) / (max_weight - min_weight)
  

st.title('Obsidian Graph')
net.from_nx(G)
components.html(net.generate_html(), height=420)