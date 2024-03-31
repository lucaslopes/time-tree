import time
import streamlit as st
from datetime import datetime
from tinydb import TinyDB, Query

# Initialize the database
db_path = 'time_tree.json'
db = TinyDB(db_path)

# Initialize or retrieve the current node
if 'current_task' not in st.session_state:
    st.session_state['current_task'] = 0
if 'running' not in st.session_state:
    st.session_state['running'] = False
if 'start_time' not in st.session_state:
    st.session_state['start_time'] = None
if 'end_time' not in st.session_state:
    st.session_state['end_time'] = None

def format_duration(duration):
    # Helper function to format the duration into hh:mm:ss
    return str(duration).split(".")[0]

def update_stopwatch():
    # Function to update and display the stopwatch time
    if st.session_state['running']:
        st.session_state['end_time'] = datetime.now()
        duration = st.session_state['end_time'] - st.session_state['start_time']
        st.session_state['stopwatch_display'].markdown(f"Stopwatch: {format_duration(duration)}")

# Function to display the path
def display_path(path_placeholder):
    node = st.session_state['current_task']
    path = str(node)
    while node != 0:
        node_data = db.search(Query().id == node)
        if node_data and isinstance(node_data[0], dict) and 'parent_id' in node_data[0]:
            parent = node_data[0]['parent_id']
            node = parent
            path = f"{parent} > {path}"
        else:
            break  # Break if the data structure is not as expected
    path_placeholder.write(f"Path: {path}")

# Function to display tasks from the database
def display_tasks():
    tasks = db.all()
    if tasks:
        # Adding the ID from the TinyDB as the first column
        tasks_data = [[task.doc_id] + [task['start_time'], task['end_time'], task['duration'], task['description']] for task in tasks]
        # Defining column names
        columns = ['ID', 'Start Time', 'End Time', 'Duration', 'Description']
        table_placeholder.table([columns] + tasks_data)

# Function to move to parent node
def go_back():
    if st.session_state['current_task'] != 0:
        parent = db.search(Query().id == st.session_state['current_task'])[0]['parent_id']
        st.session_state['current_task'] = parent
        st.experimental_rerun()

# Dynamic page title
page_title = "Time Tree" if not st.session_state['running'] else format_duration(datetime.now() - st.session_state['start_time'])
st.set_page_config(page_title=page_title, layout="centered")

# Create a placeholder for the button and text input
path_placeholder = st.empty()
back_placeholder = st.empty()
button_placeholder = st.empty()
description_placeholder = st.empty()
table_placeholder = st.empty()

# Display path
display_path(path_placeholder)

# Back button
if back_placeholder.button('Back'):
    go_back()

# Create a button in the placeholder to start/stop the stopwatch with unique keys
if not st.session_state['running']:
    main_button = button_placeholder.button('Start', key='start_button')
else:
    main_button = button_placeholder.button('Stop', key='stop_button')
task_description = ''

if main_button:
    if not st.session_state['running']:
        # Start the stopwatch
        st.session_state['running'] = True
        st.session_state['start_time'] = datetime.now()
        st.session_state['stopwatch_display'] = st.empty()
        table_placeholder = st.empty()
    else:
        # Stop the stopwatch
        st.session_state['running'] = False
        end_time = datetime.now()
        duration = end_time - st.session_state['start_time']
        # Save to TinyDB including the task description
        new_node_id = len(db) + 1
        db.insert({
            'id': new_node_id,
            'parent_id': st.session_state['current_task'],
            'start_time': st.session_state['start_time'].strftime('%Y-%m-%d %H:%M:%S'), 
            'end_time': end_time.strftime('%Y-%m-%d %H:%M:%S'), 
            'duration': format_duration(duration),
            'description': st.session_state['task_description']
        })
        st.session_state['stopwatch_display'].markdown(f"Stopwatch stopped at: {format_duration(duration)}")
        description_placeholder.empty()
        button_placeholder.empty()
        # Ensure the button switches back to "Start"
        main_button = button_placeholder.button('Start', key='restart_button')
        task_description = ''
        st.experimental_rerun()

# Update the stopwatch every second if it's running
if st.session_state['running']:
    while st.session_state['running']:
        if task_description == '':
          task_description = description_placeholder.text_input("Task Description", key="task_description")
        update_stopwatch()
        time.sleep(1)
        # Update page title in real-time
        st.experimental_rerun()
    st.session_state['task_description'] = task_description
else:
    # Display child nodes and navigation
    current_task = st.session_state['current_task']
    children = db.search(Query().parent_id == int(current_task))
    if children and all(isinstance(child, dict) and 'id' in child for child in children):
        for child in children:
            if child['id'] != current_task:
              if st.button(f"Go to node {child['id']}"):
                  st.session_state['current_task'] = child['id']
                  st.experimental_rerun()
