import os
import streamlit as st
from datetime import datetime
import pyperclip

# Function to convert Unix timestamp to the required local UTC format (YY-MM-DD HH:MM:SS)
def unix_to_local_utc(timestamp):
    dt = datetime.fromtimestamp(int(timestamp)).astimezone()
    return dt.strftime("%y-%m-%d %H:%M:%S")

# Folder path where subfolders are named as Unix timestamps
folder_path = "/Users/lucas/Obisidian/Timestamps"

# List all subfolder names (assumed to be Unix timestamps)
subfolders = sorted([f for f in os.listdir(folder_path) if os.path.isdir(os.path.join(folder_path, f))])

tasks = list()

st.title("Labeling Segments")

# Loop through each subfolder, showing the timestamp and allowing user to input labels
for idx, folder in enumerate(subfolders):
    start_time = unix_to_local_utc(folder)  # Convert current folder name (timestamp) to local UTC format
    
    # Handle end time logic (next timestamp or ongoing)
    if idx + 1 < len(subfolders):
        end_time = unix_to_local_utc(subfolders[idx + 1])  # Convert next folder timestamp to end time
        default_label = ""  # No default label for completed tasks
    else:
        end_time = "Ongoing"  # Last timestamp is ongoing
        default_label = "Labelling Segments"  # Default label for ongoing task
    
    # set title to: Task of duration: start_time - end_time
    if end_time != "Ongoing":
        start_dt = datetime.strptime(start_time, "%y-%m-%d %H:%M:%S")
        end_dt = datetime.strptime(end_time, "%y-%m-%d %H:%M:%S")
        duration_seconds = (end_dt - start_dt).total_seconds()
        duration = f"{int(duration_seconds // 3600)} h {int((duration_seconds % 3600) // 60)} min {int(duration_seconds % 60)} sec"
    else:
        duration = "Ongoing"
    
    tasks.append({
        "start_time": start_time,
        "end_time": end_time,
        "duration": duration,
        "default_label": default_label
    })

tasks.reverse()

for idx, task in enumerate(tasks):

    st.subheader(f"Task of duration: {task['duration']}")

    # Input field for the user to label the timestamps
    cola, colb = st.columns([4, 1])
    with cola:
        label = st.text_input(f"Label:", key=f"Label_{idx}", value=task['default_label'])
    with colb:
        if st.button('Copy Label', key=f"Button_{idx}"):
            pyperclip.copy(label)
            st.success('Text copied successfully!')

    col1, col2 = st.columns(2)

    with col1:
        st.write(f"Start Time:")
        st.code(task['start_time'], language="markdown")
        # st.success(f"Start time {start_time} copied!")

    with col2:
        st.write(f"End Time:")
        st.code(task['end_time'], language="markdown")
        # st.success(f"End time {end_time} copied!")

    st.write("---")  # Separator between different segments