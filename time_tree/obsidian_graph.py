import networkx as nx
import streamlit as st
from pathlib import Path
from pyvis.network import Network
from obsidiantools import api as otools
from streamlit.components import v1 as components

VAULT_DIRECTORY = Path('/Users/lucas/Documents/TimeTree')
vault = otools.Vault(VAULT_DIRECTORY).connect().gather()
df = vault.get_note_metadata()
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