import obsidiantools.api as otools
from IPython.display import display, HTML
from pyvis.network import Network

VAULT_DIRECTORY = '/Users/lucas/Documents/TimeTree'
vault = otools.Vault(VAULT_DIRECTORY).connect().gather()

G = vault.graph
net = Network(notebook=False)
net.from_nx(G)

net.save_graph("networkx-pyvis.html")
HTML(filename="networkx-pyvis.html")
