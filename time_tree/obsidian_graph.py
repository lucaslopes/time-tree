import networkx as nx
import streamlit as st
import streamlit.components.v1 as components
import obsidiantools.api as otools
from pyvis.network import Network

VAULT_DIRECTORY = '/Users/lucas/Documents/TimeTree'
vault = otools.Vault(VAULT_DIRECTORY).connect().gather()
G = vault.graph

net = Network(
  notebook=False,
  height='420px',
  width='100%',
  bgcolor='#222222',
  font_color='white')
net.from_nx(G)

# Generate network with specific layout settings
net.repulsion(
  node_distance=420,
  central_gravity=0.33,
  spring_length=110,
  spring_strength=0.10,
  damping=0.95)

st.title('Obsidian Graph')

# Load HTML content in the Streamlit component
components.html(net.generate_html(), height=435)